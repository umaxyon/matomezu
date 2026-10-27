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
	"sync"
)

// API は常駐の AI の入口を呼ぶ口
type API interface {
	Get(path string) (json.RawMessage, error)
	Post(path string, body any) (json.RawMessage, error)
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
func Serve(in io.Reader, out io.Writer, api API, version string) error {
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
		result, err := handle(req, api, version)
		if err != nil {
			write(response{JSONRPC: "2.0", ID: req.ID, Error: err})
			continue
		}
		write(response{JSONRPC: "2.0", ID: req.ID, Result: result})
	}
	return sc.Err()
}

func handle(req request, api API, version string) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &p)
		v := p.ProtocolVersion
		if v == "" {
			v = protocolVersion
		}
		return map[string]any{
			"protocolVersion": v,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "matomezu", "version": version},
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
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return nil, &rpcError{-32602, "invalid params"}
		}
		text, failed := callTool(api, p.Name, p.Arguments)
		return map[string]any{"content": []map[string]any{{"type": "text", "text": text}}, "isError": failed}, nil
	default:
		return nil, &rpcError{-32601, fmt.Sprintf("method not found: %s", req.Method)}
	}
}
