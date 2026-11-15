package deliver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"
)

// fakeServer は、会話 sessions を持つ偽の opencode のサーバー。synthetic で受けた本文を got に入れる。答えは opencode のサーバーが返す形
func fakeServer(t *testing.T, password string, sessions []string, got chan<- map[string]any) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/session/{id}/synthetic", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if u, p, ok := r.BasicAuth(); !ok || u != "opencode" || p != password {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"_tag":"UnauthorizedError","message":"Authentication required"}`))
			return
		}
		id := r.PathValue("id")
		known := false
		for _, s := range sessions {
			known = known || s == id
		}
		if !known {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"_tag":"SessionNotFoundError","sessionID":"` + id + `","message":"Session not found: ` + id + `"}`))
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		got <- body
		_, _ = w.Write([]byte(`{"data":{"id":"msg_1","sessionID":"` + id + `","time":{"created":1},"type":"synthetic","payload":{"text":"x","description":"matomezu"},"delivery":"steer"}}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// writeService は、サーバー url の service.json を dir に置き、そのパスを返す
func writeService(t *testing.T, dir, url, password string) string {
	t.Helper()
	path := filepath.Join(dir, "service.json")
	b, _ := json.Marshal(map[string]any{"id": "x", "version": "2.3.0", "url": url, "pid": 1, "password": password})
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// 会話を持つサーバーには、起こす知らせの印を付けた本文を synthetic で渡す。会話が無い・service.json が無い・サーバーにつながらないときは Absent、断られたら Failed
func TestDeliver(t *testing.T) {
	got := make(chan map[string]any, 1)
	srv := fakeServer(t, "pw", []string{"ses_1"}, got)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	path := writeService(t, t.TempDir(), srv.URL, "pw")

	if r, err := Deliver(ctx, path, "ses_1", "hello"); r != Delivered {
		t.Fatalf("deliver = %s, %v", r, err)
	}
	body := <-got
	meta, _ := body["metadata"].(map[string]any)
	if body["text"] != "hello" || body["description"] != "matomezu" || body["delivery"] != "steer" || meta["matomezu"] != "wake" || len(body) != 4 {
		t.Fatalf("synthetic = %v", body)
	}
	if r, _ := Deliver(ctx, path, "ses_2", "hello"); r != Absent {
		t.Fatalf("other conversation = %s", r)
	}
	if r, _ := Deliver(ctx, path, "", "hello"); r != Absent {
		t.Fatalf("no session = %s", r)
	}
	if r, _ := Deliver(ctx, filepath.Join(t.TempDir(), "service.json"), "ses_1", "hello"); r != Absent {
		t.Fatalf("no service.json = %s", r)
	}
	if r, _ := Deliver(ctx, writeService(t, t.TempDir(), srv.URL, "wrong"), "ses_1", "hello"); r != Failed {
		t.Fatalf("refused = %s", r)
	}
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	if r, _ := Deliver(ctx, writeService(t, t.TempDir(), closed.URL, "pw"), "ses_1", "hello"); r != Absent {
		t.Fatalf("server not running = %s", r)
	}
}

// 状態のフォルダが無ければ ~/.local/state の下
func TestServicePath(t *testing.T) {
	if got := ServicePath("/s"); got != filepath.Join("/s", "opencode", "service.json") {
		t.Fatalf("with XDG_STATE_HOME = %s", got)
	}
	home, _ := os.UserHomeDir()
	if got := ServicePath(""); got != filepath.Join(home, ".local", "state", "opencode", "service.json") {
		t.Fatalf("without = %s", got)
	}
}

// opencode のプラグイン（../matomezu.ts）が見る起こす知らせの印は、送る印 WakeMetadata と同じ
func TestPluginReadsTheSameWakeMark(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "matomezu.ts"))
	if err != nil {
		t.Fatal(err)
	}
	find := func(name string) string {
		m := regexp.MustCompile(`(?m)^const ` + name + ` = "([^"]*)"$`).FindSubmatch(b)
		if m == nil {
			t.Fatalf("matomezu.ts has no const %s", name)
		}
		return string(m[1])
	}
	key, value := find("WAKE_KEY"), find("WAKE_VALUE")
	if len(WakeMetadata) != 1 || WakeMetadata[key] != value {
		t.Fatalf("matomezu.ts looks for %s=%s, WakeMetadata = %v", key, value, WakeMetadata)
	}
}
