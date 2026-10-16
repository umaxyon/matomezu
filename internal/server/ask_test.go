package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// 吹き出しかドロワーかは文字の量で決まる（全角 1・半角 0.5）。2 つ以上なら A, B…。id は書かなければ連番（D36。ask.go）
func TestPrepareDecidesTheView(t *testing.T) {
	items, err := prepare([]AskItem{
		{Box: "1", Text: "１２３４５６７８９０１２３４５６７８９０", Choices: []string{"はい", "いいえ"}}, // 20 文字・ボタンの合計 5
		{Box: "2", Text: strings.Repeat("a", 40)},                        // 半角 40 = 20
		{Box: "3", Text: "１２３４５６７８９０１２３４５６７８９０１"},                        // 21 文字
		{Box: "4", Choices: []string{"了承する", "やめる"}},                     // ボタンの合計 7
		{Box: "5", Choices: []string{"A", "B", "C"}},                     // ボタン 3 つ
		{Box: "6", Text: "選ぶ", Choices: []string{"x", "y"}, Multi: true}, // 複数選択
		{ID: "own", Box: "7", Text: "書いて", Input: true},                  // 文字の入力
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"bubble", "bubble", "drawer", "drawer", "drawer", "drawer", "drawer"}
	for i, it := range items {
		if it.View != want[i] {
			t.Errorf("item %d: %s, want %s", i+1, it.View, want[i])
		}
		if it.Letter != string(rune('A'+i)) || it.State != "open" {
			t.Errorf("item %d: letter %q state %q", i+1, it.Letter, it.State)
		}
	}
	if items[0].ID != "1" || items[6].ID != "own" {
		t.Errorf("ids: %q %q", items[0].ID, items[6].ID)
	}
	one, _ := prepare([]AskItem{{Box: "1", Text: "x"}})
	if one[0].Letter != "" {
		t.Errorf("a single item has no letter: %q", one[0].Letter)
	}
	for _, bad := range [][]AskItem{
		nil,
		{{Text: "no box"}},
		{{Box: "1"}},
		{{Box: "1", Text: "x"}, {ID: "1", Box: "2", Text: "y"}},
		{{Box: "1", Text: strings.Repeat("長", 151)}},
		{{Box: "1", Choices: []string{"x"}, Multi: true}},
		{{Box: "1", Choices: []string{" "}}},
	} {
		if _, err := prepare(bad); err == nil {
			t.Errorf("accepted %+v", bad)
		}
	}
}

// ask -new は、AI が読んだあとにユーザーの側で変わったときだけ話題を返す。吹き出しの開閉は数えない
func TestAskNewOnlyAfterUserChanges(t *testing.T) {
	hub, ts, _ := setupHub(t)
	items, _ := prepare([]AskItem{{Box: "1", Text: "x"}, {Box: "2", Text: "y"}})
	hub.mu.Lock()
	hub.topic = &Topic{Doc: "d", Path: "a.json", State: "open", Items: items}
	hub.mu.Unlock()
	get := func(q string) string {
		res := do(t, "GET", ts.URL+"/api/ask"+q, "", nil)
		defer res.Body.Close()
		out, _ := io.ReadAll(res.Body)
		return strings.TrimSpace(string(out))
	}
	screen := func(b string) {
		res := do(t, "POST", ts.URL+"/api/ask/screen", b, nil)
		res.Body.Close()
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("screen %s: %d", b, res.StatusCode)
		}
	}
	if got := get("?new=1"); got != "{}" {
		t.Fatalf("nothing new yet: %s", got)
	}
	screen(`{"item":"1","state":"hidden"}`)
	if got := get("?new=1"); got != "{}" {
		t.Fatalf("hiding is not news: %s", got)
	}
	screen(`{"item":"1","state":"answered","answer":["ok"]}`)
	if got := get("?new=1"); !strings.Contains(got, `"ok"`) {
		t.Fatalf("an answer is news: %s", got)
	}
	if got := get("?new=1"); got != "{}" {
		t.Fatalf("read once: %s", got)
	}
	screen(`{"item":"2","state":"declined"}`)
	get("?last=1") // ask -status も読んだことになる
	if got := get("?new=1"); got != "{}" {
		t.Fatalf("read by -status: %s", got)
	}
	screen(`{"state":"ended"}`)
	if got := get("?new=1"); !strings.Contains(got, `"ended"`) {
		t.Fatalf("the user ended it: %s", got)
	}
}

// ask -wait は、全部に答える・ユーザーが終える・-end・時間切れで返る。コマンドが切れたら待ちは残らない
func TestAskWait(t *testing.T) {
	hub, ts, _ := setupHub(t)
	open := func() {
		items, _ := prepare([]AskItem{{Box: "1", Text: "x"}, {Box: "2", Text: "y"}})
		hub.mu.Lock()
		hub.topic, hub.lastTopic = &Topic{Doc: "d", Path: "a.json", State: "open", Items: items}, nil
		hub.mu.Unlock()
	}
	wait := func(sec string) <-chan AskWait {
		ch := make(chan AskWait, 1)
		go func() {
			res := do(t, "GET", ts.URL+"/api/ask/wait?sec="+sec, "", nil)
			defer res.Body.Close()
			var w AskWait
			json.NewDecoder(res.Body).Decode(&w)
			ch <- w
		}()
		time.Sleep(50 * time.Millisecond)
		return ch
	}
	screen := func(b string) { do(t, "POST", ts.URL+"/api/ask/screen", b, nil).Body.Close() }
	got := func(ch <-chan AskWait) AskWait {
		select {
		case w := <-ch:
			return w
		case <-time.After(3 * time.Second):
			t.Fatal("wait did not return")
		}
		return AskWait{}
	}
	if w := got(wait("5")); w.Reason != "none" {
		t.Fatalf("no topic: %+v", w)
	}
	open()
	ch := wait("5")
	screen(`{"item":"1","state":"answered","answer":["ok"]}`)
	select {
	case w := <-ch:
		t.Fatalf("returned after one answer: %+v", w)
	case <-time.After(100 * time.Millisecond):
	}
	screen(`{"item":"2","state":"seen"}`)
	if w := got(ch); w.Reason != "answered" || w.Topic == nil || w.Topic.Items[0].Answer[0] != "ok" {
		t.Fatalf("answered: %+v", w)
	}
	open()
	ch = wait("5")
	screen(`{"state":"ended"}`)
	if w := got(ch); w.Reason != "ended" || w.Topic == nil {
		t.Fatalf("ended: %+v", w)
	}
	open()
	ch = wait("5")
	do(t, "POST", ts.URL+"/api/ask/control", `{"end":true}`, map[string]string{"X-Matomezu-Token": "secret"}).Body.Close()
	if w := got(ch); w.Reason != "withdrawn" {
		t.Fatalf("withdrawn: %+v", w)
	}
	open()
	if w := got(wait("1")); w.Reason != "timeout" || w.Topic == nil {
		t.Fatalf("timeout: %+v", w)
	}
}
