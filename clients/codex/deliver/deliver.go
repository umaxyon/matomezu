// Package deliver は、Codex の会話に matomezu の起こす知らせを渡す（matomezu deliver codex の中身）。
// 会話を持つ Codex の app-server（daemon）の制御ソケット（<CODEX_HOME>/app-server-control/app-server-control.sock）に WebSocket でつなぎ、
// initialize・initialized のあと、thread/loaded/list でその app-server が会話を持つかを確かめ、turn/start の toolOutput で本文を渡す。
// 入力を待っている会話はそれで動き出し、生成中の会話には同じターンに足される。
// ソケットが無い・つながらない・会話を持っていないときは Absent（その AI のプログラムに会話が無い。matomezu は次の呼び出しの返事で渡す）。
// つながったのに断られたときは Failed。matomezu の常駐やほかのパッケージは読まない
package deliver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"

	"github.com/coder/websocket"
)

// Result は渡した結果
type Result string

const (
	Delivered Result = "delivered" // 渡せた
	Absent    Result = "absent"    // その app-server に会話が無い（つながらないときも）
	Failed    Result = "failed"    // つながったのに渡せなかった
)

// toolName は、toolOutput の名前（Codex の会話の記録に、この名前の道具の結果として残る）
const toolName = "matomezu_notice"

// SocketPath は、CODEX_HOME（空なら ~/.codex）の app-server の制御ソケット
func SocketPath(codexHome string) string {
	if codexHome == "" {
		home, _ := os.UserHomeDir()
		codexHome = filepath.Join(home, ".codex")
	}
	return filepath.Join(codexHome, "app-server-control", "app-server-control.sock")
}

// Deliver は、ソケット socket の app-server が持つ会話 thread に、本文 text を渡す。version は名乗る matomezu の版
func Deliver(ctx context.Context, socket, thread, text, version string) (Result, error) {
	if thread == "" {
		return Absent, errors.New("no session id of the conversation")
	}
	if _, err := os.Stat(socket); err != nil {
		return Absent, err
	}
	client := &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}}
	conn, _, err := websocket.Dial(ctx, "ws://localhost/", &websocket.DialOptions{HTTPClient: client})
	if err != nil {
		return Absent, err
	}
	defer conn.CloseNow()
	conn.SetReadLimit(-1)
	rpc := &session{ctx: ctx, conn: conn}
	if _, err := rpc.call("initialize", map[string]any{"clientInfo": map[string]string{"name": "matomezu", "version": version}}); err != nil {
		return Absent, err
	}
	if err := rpc.notify("initialized"); err != nil {
		return Absent, err
	}
	loaded, err := rpc.call("thread/loaded/list", map[string]any{})
	if err != nil {
		return Absent, err
	}
	var list struct {
		Data []string `json:"data"`
	}
	if err := json.Unmarshal(loaded, &list); err != nil {
		return Absent, err
	}
	if !slices.Contains(list.Data, thread) {
		return Absent, fmt.Errorf("the app-server does not have conversation %s", thread)
	}
	if _, err := rpc.call("turn/start", map[string]any{
		"threadId":   thread,
		"input":      []any{},
		"toolOutput": map[string]any{"name": toolName, "output": text},
	}); err != nil {
		return Failed, err
	}
	_ = conn.Close(websocket.StatusNormalClosure, "")
	return Delivered, nil
}

// session は、app-server との JSON-RPC のやり取り 1 つ
type session struct {
	ctx  context.Context
	conn *websocket.Conn
	next int
}

func (s *session) write(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return s.conn.Write(s.ctx, websocket.MessageText, b)
}

func (s *session) notify(method string) error {
	return s.write(map[string]any{"method": method})
}

// call は、頼み method を送り、同じ id の答えの result を返す（間に届く知らせは読み捨てる）
func (s *session) call(method string, params any) (json.RawMessage, error) {
	s.next++
	id := s.next
	if err := s.write(map[string]any{"id": id, "method": method, "params": params}); err != nil {
		return nil, err
	}
	for {
		_, b, err := s.conn.Read(s.ctx)
		if err != nil {
			return nil, err
		}
		var answer struct {
			ID     *int            `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(b, &answer) != nil || answer.ID == nil || *answer.ID != id {
			continue
		}
		if answer.Error != nil {
			return nil, fmt.Errorf("%s: %s", method, answer.Error.Message)
		}
		return answer.Result, nil
	}
}
