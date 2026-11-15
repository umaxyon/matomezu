// Package mcp は、AI に matomezu を MCP 公開ツールとして渡す MCP のサーバー（標準入出力で 1 行 1 つの JSON-RPC 2.0）。
//
// MCP 公開ツールは常駐の AI の入口（/api/ai/...）を呼ぶ。アクションは 1 つずつ MCP 公開ツールにせず、actions（今使えるアクションの一覧などを返す）で今使えるものを読み、
// perform で行う。追加プラグインを足し・外しても、MCP 公開ツールの一覧は変わらない。
package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
)

// 常駐の AI の入口とやりとりするヘッダ（server の ParticipantHeader・NoticeHeader・BranchHeader・HostHeader・ModelHeader と同じ名前）
const (
	participantHeader     = "X-Matomezu-Participant"       // 送る: join の返事で受けた参加の id
	noticeHeader          = "X-Matomezu-Notice"            // 返る: AI への知らせ（値は URL エンコード）
	branchHeader          = "X-Matomezu-Branch"            // 送る: 参加の id と一緒にいつも。git のブランチ（値は URL エンコード。空はブランチが無い）
	hostHeader            = "X-Matomezu-Host"              // 送る: いつも（join も）。AI のプログラムのプロセス id
	hostSessionHeader     = "X-Matomezu-Host-Session"      // 送る: いつも（join も）。AI のプログラムが MCP を立てたときのセッション id（分かるときだけ。/clear でも変わらない）
	sessionPidHeader      = "X-Matomezu-Session-Pid"       // 送る: 名乗ったとき。セッションと同じだけ生きるプロセスの id（居なくなればセッションが終わったということ）
	sessionPidSpaceHeader = "X-Matomezu-Session-Pid-Space" // 送る: セッションのプロセスを名乗ったとき。プロセス id が通じる範囲の印（常駐が同じ印のときだけ確かめる）
	modelHeader           = "X-Matomezu-Model"             // 送る: 参加の id と一緒に、呼び出しの _meta にモデルがあったとき。今のモデル（値は URL エンコード）
)

// API は常駐の AI の入口を呼ぶ口。header は送るヘッダ、戻りの 2 つ目は返事のヘッダ
type API interface {
	Get(path string, header http.Header) (json.RawMessage, http.Header, error)
	Post(path string, body any, header http.Header) (json.RawMessage, http.Header, error)
}

// caller は MCP 公開ツールが常駐を呼ぶ口（conn がヘッダを足す）
type caller interface {
	Get(path string) (json.RawMessage, error)
	Post(path string, body any) (json.RawMessage, error)
}

// conn は 1 つの接続の状態。join で受けた参加の id を、その呼び出しのセッション id に結んで持ち、以後の呼び出しに添える。返事のヘッダの知らせは 1 回の呼び出しの間だけ持つ。
// 1 つの MCP のプロセスを、いくつものセッションが使い回す AI（opencode）があるので、参加の id はセッション id ごとに持つ
type conn struct {
	api          API
	version      string
	ai           string            // initialize で届いた clientInfo の名前と版
	env          string            // 環境名
	branch       func() string     // 呼び出しのたびに git のブランチを読む（読めなければ空）
	host         string            // AI のプログラムのプロセス id
	hostSession  string            // AI のプログラムが MCP を立てたときのセッション id（分からなければ空）
	sessionPid   string            // セッションと同じだけ生きるプロセスの id（空は名乗らない）
	pidSpace     string            // sessionPid が通じる範囲の印（sessionPid を名乗るとき）
	participants map[string]string // join の返事で受けた参加の id。join の呼び出しのセッション id（無ければ空）ごと
	sessionID    string            // いま処理している呼び出しの _meta にあったセッション id
	model        string            // いま処理している呼び出しの _meta にあったモデル（無ければ空）
	notice       string            // いま処理している呼び出しの返事で届いた知らせ
}

func (c *conn) header() http.Header {
	h := http.Header{}
	if c.host != "" {
		h.Set(hostHeader, c.host)
	}
	if c.sessionPid != "" {
		h.Set(sessionPidHeader, c.sessionPid)
		h.Set(sessionPidSpaceHeader, c.pidSpace)
	}
	if c.hostSession != "" {
		h.Set(hostSessionHeader, c.hostSession)
	}
	if p := c.participant(); p != "" {
		h.Set(participantHeader, p)
		h.Set(branchHeader, url.QueryEscape(c.branch()))
		if c.model != "" {
			h.Set(modelHeader, url.QueryEscape(c.model))
		}
	}
	return h
}

// participant は、いま処理している呼び出しの参加の id（無ければ空）。セッション id が同じ参加者があればそれ。
// 無ければ、参加者が 1 人だけで、その人か呼び出しのどちらかにセッション id が無いときだけ、その人（セッション id を一方だけ添える AI のため）。
// どちらにもセッション id があって違うときは、ほかのセッションの参加者を添えない
func (c *conn) participant() string {
	if p, ok := c.participants[c.sessionID]; ok {
		return p
	}
	if len(c.participants) != 1 {
		return ""
	}
	for session, p := range c.participants {
		if session == "" || c.sessionID == "" {
			return p
		}
	}
	return ""
}

func (c *conn) heard(h http.Header) {
	if v := h.Get(noticeHeader); v != "" {
		if text, err := url.QueryUnescape(v); err == nil {
			c.notice = text
		}
	}
}

func (c *conn) Get(path string) (json.RawMessage, error) {
	out, h, err := c.api.Get(path, c.header())
	c.heard(h)
	return out, err
}

func (c *conn) Post(path string, body any) (json.RawMessage, error) {
	out, h, err := c.api.Post(path, body, c.header())
	c.heard(h)
	return out, err
}

// protocolVersion は、AI の側が版を言わなかったときに答える MCP の版
const protocolVersion = "2025-06-18"

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// Serve は in から頼みを読み、out に答えを書く。in が終わると戻る
// env は環境名（join で常駐に渡す）。branch は git のブランチを読む関数（参加の id と一緒に常駐に添える）、host は AI のプログラムのプロセス id、
// hostSession は AI のプログラムが MCP を立てたときのセッション id（どちらもいつも添える。起こす知らせの宛て先）。
// sessionPid が空でなければ、それがセッションと同じだけ生きるプロセスだと名乗り（pidSpace はその印）、居なくなったら、常駐が退室させる
func Serve(in io.Reader, out io.Writer, api API, version, env string, branch func() string, host, hostSession, sessionPid, pidSpace string) error {
	c := &conn{api: api, version: version, ai: "unknown", env: env, branch: branch, host: host, hostSession: hostSession, sessionPid: sessionPid, pidSpace: pidSpace, participants: map[string]string{}}
	var mu sync.Mutex
	enc := json.NewEncoder(out)
	write := func(r response) {
		mu.Lock()
		defer mu.Unlock()
		_ = enc.Encode(r)
	}
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 0, 1<<16), 16<<20)
	for sc.Scan() {
		var req request
		if err := json.Unmarshal(sc.Bytes(), &req); err != nil {
			write(response{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{-32700, "parse error"}})
			continue
		}
		if len(req.ID) == 0 {
			continue // 知らせ（notifications/initialized など）には答えない
		}
		result, err := handle(req, c)
		if err != nil {
			write(response{JSONRPC: "2.0", ID: req.ID, Error: err})
			continue
		}
		write(response{JSONRPC: "2.0", ID: req.ID, Result: result})
	}
	return sc.Err()
}

func handle(req request, c *conn) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
			ClientInfo      struct {
				Name    string `json:"name"`
				Version string `json:"version"`
			} `json:"clientInfo"`
		}
		_ = json.Unmarshal(req.Params, &p)
		c.ai = aiName(p.ClientInfo.Name, p.ClientInfo.Version)
		v := p.ProtocolVersion
		if v == "" {
			v = protocolVersion
		}
		return map[string]any{
			"protocolVersion": v,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "matomezu", "version": c.version},
			"instructions":    instructions,
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		return map[string]any{"tools": listTools()}, nil
	case "tools/call":
		var p struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
			Meta      json.RawMessage `json:"_meta"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, &rpcError{-32602, "invalid params"}
		}
		c.sessionID, c.model = fromMeta(p.Meta)
		text, failed := callTool(c, p.Name, p.Arguments)
		return map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "isError": failed}, nil
	default:
		return nil, &rpcError{-32601, fmt.Sprintf("method not found: %s", req.Method)}
	}
}

// fromMeta は、tools/call の _meta から、AI が添えたセッション id とモデルを読む（無ければ空）。
// セッション id は sessionId（無ければ threadId、無ければ opencode の ai.opencode/sessionID）。モデルは AI ごとの置き場所（Codex は x-codex-turn-metadata の model）
func fromMeta(meta json.RawMessage) (sessionID, model string) {
	var m struct {
		SessionID string `json:"sessionId"`
		ThreadID  string `json:"threadId"`
		OpenCode  string `json:"ai.opencode/sessionID"`
		Codex     struct {
			Model string `json:"model"`
		} `json:"x-codex-turn-metadata"`
	}
	if len(meta) == 0 || json.Unmarshal(meta, &m) != nil {
		return "", ""
	}
	sessionID = m.SessionID
	if sessionID == "" {
		sessionID = m.ThreadID
	}
	if sessionID == "" {
		sessionID = m.OpenCode
	}
	return sessionID, m.Codex.Model
}

// aiName は clientInfo の名前と版から、参加者の表に載せる AI の名前（40 字まで）を作る
func aiName(name, version string) string {
	n := name
	if version != "" {
		n += " " + version
	}
	if n == "" {
		return "unknown"
	}
	if r := []rune(n); len(r) > 40 {
		return string(r[:40])
	}
	return n
}
