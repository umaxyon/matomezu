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

// 常駐の AI の入口とやりとりするヘッダ（server の ParticipantHeader・NoticeHeader と同じ名前）
const (
	participantHeader = "X-Matomezu-Participant" // 送る: join の返事で受けた参加の id
	noticeHeader      = "X-Matomezu-Notice"      // 返る: AI への知らせ（値は URL エンコード）
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

// conn は 1 つの接続の状態。参加の id を以後の呼び出し全部に添え、返事のヘッダの知らせを 1 回の呼び出しの間だけ持つ
type conn struct {
	api         API
	version     string
	ai          string // initialize で届いた clientInfo の名前と版
	env         string // 環境名
	participant string // join の返事で受けた参加の id
	sessionID   string // いま処理している呼び出しの _meta にあったセッション id
	notice      string // いま処理している呼び出しの返事で届いた知らせ
}

func (c *conn) header() http.Header {
	h := http.Header{}
	if c.participant != "" {
		h.Set(participantHeader, c.participant)
	}
	return h
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
// env は環境名（join で常駐に渡す）
func Serve(in io.Reader, out io.Writer, api API, version, env string) error {
	c := &conn{api: api, version: version, ai: "unknown", env: env}
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
			Meta      struct {
				SessionID string `json:"sessionId"`
				ThreadID  string `json:"threadId"`
			} `json:"_meta"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, &rpcError{-32602, "invalid params"}
		}
		c.sessionID = p.Meta.SessionID
		if c.sessionID == "" {
			c.sessionID = p.Meta.ThreadID
		}
		text, failed := callTool(c, p.Name, p.Arguments)
		return map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "isError": failed}, nil
	default:
		return nil, &rpcError{-32601, fmt.Sprintf("method not found: %s", req.Method)}
	}
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
