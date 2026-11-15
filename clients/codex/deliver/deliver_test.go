package deliver

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// fakeAppServer は、会話 loaded を持つ偽の app-server を、ソケット socket で待ち受ける。turn/start で受けた物を started に入れる
func fakeAppServer(t *testing.T, socket string, loaded []string, started chan<- map[string]any) {
	t.Helper()
	ln, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.CloseNow()
		ctx := r.Context()
		for {
			_, b, err := c.Read(ctx)
			if err != nil {
				return
			}
			var req struct {
				ID     *int           `json:"id"`
				Method string         `json:"method"`
				Params map[string]any `json:"params"`
			}
			_ = json.Unmarshal(b, &req)
			if req.ID == nil {
				continue
			}
			var result any = map[string]any{}
			switch req.Method {
			case "thread/loaded/list":
				result = map[string]any{"data": loaded}
			case "turn/start":
				started <- req.Params
				result = map[string]any{"turn": map[string]any{"id": "t1"}}
			}
			// 答えの前に知らせを 1 つ挟む（読み捨てられること）
			note, _ := json.Marshal(map[string]any{"method": "thread/status/changed", "params": map[string]any{}})
			_ = c.Write(ctx, websocket.MessageText, note)
			out, _ := json.Marshal(map[string]any{"id": *req.ID, "result": result})
			_ = c.Write(ctx, websocket.MessageText, out)
		}
	})}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })
}

// 会話を持つ app-server には turn/start の toolOutput で本文を渡し、持たない app-server とソケットの無い所は Absent
func TestDeliver(t *testing.T) {
	dir := t.TempDir()
	socket := filepath.Join(dir, "s.sock")
	started := make(chan map[string]any, 1)
	fakeAppServer(t, socket, []string{"T1"}, started)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if got, err := Deliver(ctx, socket, "T1", "hello", "v1"); got != Delivered {
		t.Fatalf("deliver = %s, %v", got, err)
	}
	p := <-started
	out, _ := p["toolOutput"].(map[string]any)
	if p["threadId"] != "T1" || out["output"] != "hello" || out["name"] != toolName {
		t.Fatalf("turn/start = %v", p)
	}
	if got, _ := Deliver(ctx, socket, "T2", "hello", "v1"); got != Absent {
		t.Fatalf("other conversation = %s", got)
	}
	if got, _ := Deliver(ctx, filepath.Join(dir, "none.sock"), "T1", "hello", "v1"); got != Absent {
		t.Fatalf("no socket = %s", got)
	}
}
