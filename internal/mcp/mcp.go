// Package mcp は、AI に matomezu を道具として渡す MCP のサーバー（標準入出力で 1 行 1 つの JSON-RPC 2.0）。
//
// 道具は常駐の AI の入口（/api/ai/...）を呼ぶ。アクションの道具は、行ってよいものだけを表（tools.go）に並べ、
// 受ける形はホストの AI 向けの機能台帳（そのアクションの引数の JSON Schema）から作る。
// 機能台帳は追加プラグインを足す・外すと変わるので、つないだあとは watchEvery ごとに読み、変わったら道具の一覧が変わったと知らせる。
package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"
)

// watchEvery は、道具の一覧が変わったかを見に行く間隔
var watchEvery = 2 * time.Second

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
	write := func(r any) {
		mu.Lock()
		defer mu.Unlock()
		_ = enc.Encode(r)
	}
	stop := make(chan struct{})
	var watching sync.WaitGroup
	defer watching.Wait()
	defer close(stop)
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 0, 1<<16), 16<<20)
	for sc.Scan() {
		var req request
		if err := json.Unmarshal(sc.Bytes(), &req); err != nil {
			write(response{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{-32700, "parse error"}})
			continue
		}
		if len(req.ID) == 0 {
			// 知らせには答えない。つなぎ終えたら、道具の一覧が変わるのを見張る
			if req.Method == "notifications/initialized" {
				watching.Add(1)
				go func() {
					defer watching.Done()
					watch(api, stop, func() {
						write(map[string]any{"jsonrpc": "2.0", "method": "notifications/tools/list_changed"})
					})
				}()
			}
			continue
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
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": true}},
			"serverInfo":      map[string]any{"name": "matomezu", "version": version},
			"instructions":    instructions,
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		tools, err := listTools(api)
		if err != nil {
			return nil, &rpcError{-32603, err.Error()}
		}
		return map[string]any{"tools": tools}, nil
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

// watch は stop が閉じるまで、AI 向けの機能台帳が変わるたびに changed を呼ぶ（読めないあいだは比べない）
func watch(api API, stop <-chan struct{}, changed func()) {
	last, _ := api.Get("api/ai/catalog")
	tick := time.NewTicker(watchEvery)
	defer tick.Stop()
	for {
		select {
		case <-stop:
			return
		case <-tick.C:
		}
		now, err := api.Get("api/ai/catalog")
		if err != nil {
			continue
		}
		if last != nil && !bytes.Equal(now, last) {
			changed()
		}
		last = now
	}
}
