package server

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func setupHub(t *testing.T) (*Hub, *httptest.Server, chan struct{}) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	web := fstest.MapFS{
		"index.html":       {Data: []byte("<html>")},
		"dist/matomezu.js": {Data: []byte("js")},
	}
	stopped := make(chan struct{}, 1)
	hub := NewHub(ctx, web, WithInterval(20*time.Millisecond),
		WithControl("secret", "v1", func() { stopped <- struct{}{} }))
	ts := httptest.NewServer(hub.Handler())
	t.Cleanup(ts.Close)
	return hub, ts, stopped
}

func openVia(t *testing.T, ts *httptest.Server, token, path string) (*http.Response, OpenResult) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"path": path})
	res := do(t, "POST", ts.URL+"/api/open", string(body), map[string]string{"X-Matomezu-Token": token})
	var out OpenResult
	if res.StatusCode == http.StatusOK {
		json.NewDecoder(res.Body).Decode(&out)
	}
	return res, out
}

func TestControlRequiresToken(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	for _, token := range []string{"", "wrong"} {
		if res, _ := openVia(t, ts, token, path); res.StatusCode != http.StatusForbidden {
			t.Fatalf("token %q: status = %d", token, res.StatusCode)
		}
	}
	if res := do(t, "GET", ts.URL+"/api/ping", "", nil); res.StatusCode != http.StatusForbidden {
		t.Fatalf("ping without token: %d", res.StatusCode)
	}
	res := do(t, "GET", ts.URL+"/api/ping", "", map[string]string{"X-Matomezu-Token": "secret"})
	b, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(b), `"version":"v1"`) {
		t.Fatalf("ping = %s", b)
	}
}

func TestOpenIsStablePerFile(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a1 := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	_, a2 := openVia(t, ts, "secret", filepath.Join(dir, ".", "a.json"))
	_, b := openVia(t, ts, "secret", filepath.Join(dir, "b.json"))
	if a1.ID == "" || a1.ID != a2.ID || a1.ID == b.ID {
		t.Fatalf("ids: %s %s %s", a1.ID, a2.ID, b.ID)
	}
	// 画面と dist は1つ、API は図ごと
	for _, p := range []string{"/", "/dist/matomezu.js", "/api/info", "/d/" + b.ID + "/api/data"} {
		if res := do(t, "GET", ts.URL+p, "", nil); res.StatusCode != http.StatusOK {
			t.Fatalf("GET %s: %d", p, res.StatusCode)
		}
	}
	if res := do(t, "GET", ts.URL+"/d/unknown/api/data", "", nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown id: %d", res.StatusCode)
	}
}

// open の「届いています」（ask）は、つながっている画面と、少しあとにつながった画面に届く
func TestArrivalIsSentAndReplayed(t *testing.T) {
	_, ts, _ := setupHub(t)
	res := do(t, "GET", ts.URL+"/api/events", "", nil)
	r := bufio.NewReader(res.Body)
	if v := nextEvent(t, r, "server"); v != `"v1"` {
		t.Fatalf("server = %s", v)
	}
	body, _ := json.Marshal(map[string]any{"path": filepath.Join(t.TempDir(), "a.json"), "ask": true})
	var a OpenResult
	json.NewDecoder(do(t, "POST", ts.URL+"/api/open", string(body), map[string]string{"X-Matomezu-Token": "secret"}).Body).Decode(&a)
	if a.Connections != 1 {
		t.Fatalf("connections = %d", a.Connections)
	}
	want := `{"arrive":"true","book":"` + a.ID + `","dialog":"true","page":""}`
	if v := nextEvent(t, r, "notify"); v != want {
		t.Fatalf("notify = %s", v)
	}
	late := bufio.NewReader(do(t, "GET", ts.URL+"/api/events", "", nil).Body)
	if v := nextEvent(t, late, "notify"); v != want {
		t.Fatalf("replayed notify = %s", v)
	}
}

func TestConnectionsAndIdle(t *testing.T) {
	hub, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	_, a := openVia(t, ts, "secret", path)
	if a.Connections != 0 || hub.Idle() == 0 {
		t.Fatalf("before: conns=%d idle=%v", a.Connections, hub.Idle())
	}

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", ts.URL+"/api/events", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	bufio.NewReader(res.Body).ReadString('\n') // 接続が登録されるまで待つ

	// 画面がつながっていれば、open はそれを知らせる（ブラウザを開き直さないため）
	if _, again := openVia(t, ts, "secret", path); again.Connections != 1 {
		t.Fatalf("connections = %d", again.Connections)
	}
	if hub.Idle() != 0 {
		t.Fatalf("idle while connected: %v", hub.Idle())
	}

	cancel()
	res.Body.Close()
	deadline := time.Now().Add(2 * time.Second)
	for hub.Idle() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("still connected")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestShutdown(t *testing.T) {
	_, ts, stopped := setupHub(t)
	res := do(t, "POST", ts.URL+"/api/shutdown", "", map[string]string{"X-Matomezu-Token": "secret"})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", res.StatusCode)
	}
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("shutdown not called")
	}
}

// 監視するのは、画面が開いている図（/api/watch で知らせたもの）だけ
func TestWatchesOnlyOpenDocs(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	pa, pb := filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")
	_, a := openVia(t, ts, "secret", pa)
	_, b := openVia(t, ts, "secret", pb)
	r := bufio.NewReader(do(t, "GET", ts.URL+"/api/events", "", nil).Body)
	var hello struct{ Client string }
	json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
	nextEvent(t, r, "version") // つないだ時点の a と b の版
	nextEvent(t, r, "version")
	if res := do(t, "POST", ts.URL+"/api/watch", `{"client":"`+hello.Client+`","docs":["`+a.ID+`"]}`, nil); res.StatusCode != http.StatusNoContent {
		t.Fatalf("watch: %d", res.StatusCode)
	}
	// 開いていない b を書き換えても知らせない。開いている a は知らせる（b の知らせが来るなら a より先に来る）
	if err := os.WriteFile(pb, []byte(`{"nodes":[{"id":1}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond)
	if err := os.WriteFile(pa, []byte(`{"nodes":[{"id":2}]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	var v struct{ Doc string }
	json.Unmarshal([]byte(nextEvent(t, r, "version")), &v)
	if v.Doc != a.ID {
		t.Fatalf("version for %s (a=%s, b=%s)", v.Doc, a.ID, b.ID)
	}
	if res := do(t, "POST", ts.URL+"/api/watch", `{"client":"nobody","docs":[]}`, nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown client: %d", res.StatusCode)
	}
}

// 登録済みの図を開き直しても読み直さない。ファイルが消えていれば空の図で作り直す
func TestReopenRecreatesMissingFile(t *testing.T) {
	_, ts, _ := setupHub(t)
	path := filepath.Join(t.TempDir(), "a.json")
	openVia(t, ts, "secret", path)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if res, _ := openVia(t, ts, "secret", path); res.StatusCode != http.StatusOK {
		t.Fatalf("reopen: %d", res.StatusCode)
	}
	if b, err := os.ReadFile(path); err != nil || string(b) != emptyDiagram {
		t.Fatalf("file = %q, %v", b, err)
	}
}

// 登録した図は store に書き、次に起動した Hub が登録し直す。ファイルが消えた図は登録しない（空の図も作らない）
func TestStoreRestoresDocs(t *testing.T) {
	dir := t.TempDir()
	store := filepath.Join(dir, "state", "docs.json")
	a, b := filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")
	for _, p := range []string{a, b} {
		if err := os.WriteFile(p, []byte(`{"nodes":[]}`), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	web := fstest.MapFS{"index.html": {Data: []byte("<html>")}}
	ctx, cancel := context.WithCancel(context.Background())
	first := NewHub(ctx, web, WithStore(store))
	for _, p := range []string{a, b, a} { // 開き直す（ユーザーに見せる）と一番新しいものになる
		if _, err := first.openDoc(p, "", true); err != nil {
			t.Fatal(err)
		}
	}
	// 問い合わせ（届いていますを聞かない。check・history など）は、登録済みの図の順番を変えない
	if _, err := first.Open(b); err != nil {
		t.Fatal(err)
	}
	cancel()
	var saved []string
	raw, _ := os.ReadFile(store)
	json.Unmarshal(raw, &saved)
	if len(saved) != 2 || saved[0] != b || saved[1] != a {
		t.Fatalf("store = %v", saved)
	}
	// 開いた図のパスの一覧なので、本人だけが読める
	if st, err := os.Stat(store); err != nil || st.Mode().Perm() != 0o600 {
		t.Fatalf("store mode = %v (%v)", st.Mode().Perm(), err)
	}

	os.Remove(b)
	ctx2, cancel2 := context.WithCancel(context.Background())
	t.Cleanup(cancel2)
	second := NewHub(ctx2, web, WithStore(store))
	if second.docs[docID(a)] == nil {
		t.Fatal("a が登録し直されていない")
	}
	if second.docs[docID(b)] != nil {
		t.Fatal("消えた b を登録した")
	}
	if _, err := os.Stat(b); err == nil {
		t.Fatal("消えた b を空の図で作った")
	}
}

// 覚えている図（新しい方から storeLimit 件）から落ちた図は、登録も外す。画面が開いている図は外さない
func TestForgetsOldDocs(t *testing.T) {
	dir := t.TempDir()
	web := fstest.MapFS{"index.html": {Data: []byte("<html>")}}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	h := NewHub(ctx, web)
	path := func(i int) string { return filepath.Join(dir, fmt.Sprintf("%d.json", i)) }
	open := func(i int) {
		if err := os.WriteFile(path(i), []byte(`{"nodes":[]}`), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := h.Open(path(i)); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < storeLimit; i++ {
		open(i)
	}
	// 0 を開いている画面がある
	h.mu.Lock()
	h.clients[make(chan event)] = &client{id: "c", docs: map[string]bool{docID(path(0)): true}}
	h.mu.Unlock()
	open(storeLimit)
	open(storeLimit + 1)
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.docs) != storeLimit+1 {
		t.Fatalf("docs = %d", len(h.docs))
	}
	if h.docs[docID(path(0))] == nil || h.docs[docID(path(1))] != nil || h.docs[docID(path(storeLimit+1))] == nil {
		t.Fatal("外す図が違う")
	}
}

// カレントの画面は、つながっている画面のうち最後にフォーカスされたもの。どれもフォーカスされていなければ最後につながったもの。
// 切れた画面は残らない（D30。docs/NOTIFY-plan.md）
func TestCurrentScreen(t *testing.T) {
	_, ts, _ := setupHub(t)
	current := func() string {
		var v struct{ Client string }
		res := do(t, "GET", ts.URL+"/api/current", "", nil)
		defer res.Body.Close()
		json.NewDecoder(res.Body).Decode(&v)
		return v.Client
	}
	if c := current(); c != "" {
		t.Fatalf("no screens: %q", c)
	}
	join := func() (string, *http.Response) {
		res := do(t, "GET", ts.URL+"/api/events", "", nil)
		var hello struct{ Client string }
		json.Unmarshal([]byte(nextEvent(t, bufio.NewReader(res.Body), "hello")), &hello)
		return hello.Client, res
	}
	focus := func(id string) int {
		return do(t, "POST", ts.URL+"/api/focus", `{"client":"`+id+`"}`, nil).StatusCode
	}
	a, ra := join()
	b, rb := join()
	if c := current(); c != b {
		t.Fatalf("before any focus, the last joined: %q (a=%s b=%s)", c, a, b)
	}
	if s := focus(a); s != http.StatusNoContent {
		t.Fatalf("focus: %d", s)
	}
	if c := current(); c != a {
		t.Fatalf("focused a: %q", c)
	}
	focus(b)
	focus(a)
	if c := current(); c != a {
		t.Fatalf("focused a last: %q", c)
	}
	// つなぎ直した画面は、前の接続でフォーカスされた時刻を送ってくる。時刻の新しい方がカレント（あとから知らせても、古い時刻なら負ける）
	c, rc := join()
	at := func(id string, ms int64) {
		do(t, "POST", ts.URL+"/api/focus", fmt.Sprintf(`{"client":%q,"at":%d}`, id, ms), nil).Body.Close()
	}
	now := time.Now().UnixMilli()
	at(b, now-9000)
	at(a, now-1000)
	at(c, now-5000)
	if cur := current(); cur != a {
		t.Fatalf("older focus time must not win: %q (a=%s c=%s)", cur, a, c)
	}
	at(c, now-500)
	if cur := current(); cur != c {
		t.Fatalf("newer focus time wins: %q (c=%s)", cur, c)
	}
	rc.Body.Close()
	focus(a)
	// a が切れたら、つながっている b
	ra.Body.Close()
	deadline := time.Now().Add(2 * time.Second)
	for current() != b {
		if time.Now().After(deadline) {
			t.Fatalf("after a left: %q", current())
		}
		time.Sleep(20 * time.Millisecond)
	}
	if s := focus(a); s != http.StatusNotFound {
		t.Fatalf("focus of a gone screen: %d", s)
	}
	rb.Body.Close()
}

// 問い合わせ・知らせのコマンド（notify・focus・ask・tour）は、無いファイルを空の図で作らずに断る。作るのは open だけ（2026-10-17 ユーザー）
func TestQueriesDoNotCreateMissingFiles(t *testing.T) {
	h, _, _ := setupHub(t)
	missing := filepath.Join(t.TempDir(), "typo.json")
	checks := map[string]error{}
	_, checks["existingDoc"] = h.existingDoc(missing)
	_, _, checks["ask"] = h.Ask(missing, []AskItem{{Box: "1", Text: "x", Choices: []string{"a"}}})
	_, checks["focus"] = h.Point(PointRequest{Path: missing, Box: "1"})
	_, checks["tour"] = h.StartTour(TourRequest{Path: missing, Title: "t", Steps: []TourStep{{Box: "1", Say: "x"}}})
	for name, err := range checks {
		if err == nil || !strings.Contains(err.Error(), "not found") {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	if _, err := os.Stat(missing); !os.IsNotExist(err) {
		t.Fatalf("the file was created: %v", err)
	}
	if len(h.docs) != 0 {
		t.Fatalf("registered: %d", len(h.docs))
	}
}

// close は、どの画面のタブでも開いていない図には「not open」を返す（何もしていないのに成功に見せない。2026-10-17 ユーザー）
func TestCloseNeedsAnOpenTab(t *testing.T) {
	h, ts, _ := setupHub(t)
	dir := t.TempDir()
	pa, pb := filepath.Join(dir, "a.json"), filepath.Join(dir, "b.json")
	_, a := openVia(t, ts, "secret", pa)
	openVia(t, ts, "secret", pb)
	if _, err := h.Close(pa); err == nil || !strings.Contains(err.Error(), "not open") {
		t.Fatalf("no screen: err = %v", err)
	}
	r := bufio.NewReader(do(t, "GET", ts.URL+"/api/events", "", nil).Body)
	var hello struct{ Client string }
	json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
	if res := do(t, "POST", ts.URL+"/api/watch", `{"client":"`+hello.Client+`","docs":["`+a.ID+`"]}`, nil); res.StatusCode != http.StatusNoContent {
		t.Fatalf("watch: %d", res.StatusCode)
	}
	if res, err := h.Close(pa); err != nil || res.Connections != 1 {
		t.Fatalf("open tab: %+v %v", res, err)
	}
	if _, err := h.Close(pb); err == nil || !strings.Contains(err.Error(), "not open") {
		t.Fatalf("not in a tab: err = %v", err)
	}
}
