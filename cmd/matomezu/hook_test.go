package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeTalk は常駐の /api/ai/talked の代わり。link が L1 の参加者が、候補に L1 が来たらセッション S1 に結ばれ、そのときに 1 度だけ伝える
type fakeTalk struct {
	bound  bool
	told   bool
	bodies []map[string]any
}

func (f *fakeTalk) api(body []byte) ([]byte, error) {
	var in map[string]any
	_ = json.Unmarshal(body, &in)
	f.bodies = append(f.bodies, in)
	if c, ok := in["candidates"].([]any); ok {
		for _, x := range c {
			if x == "6f1c2a3e-1111-4222-8333-444455556666" {
				f.bound = true
			}
		}
	}
	reply := map[string]any{"welcomes": []any{}, "unbound": !f.bound}
	if f.bound {
		reply["workTitle"] = "ひよこ M-0001 作業"
	}
	if f.bound && !f.told {
		f.told = true
		reply["welcomes"] = []any{map[string]any{"workroom": "ひよこ", "message": "matomezu に参加しました。ワークルーム名: ひよこ", "forAi": "You joined matomezu. Workroom name: ひよこ"}}
	}
	out, _ := json.Marshal(reply)
	return out, nil
}

// 会話の記録を後ろから調べて uuid を送り、結べたら systemMessage・sessionTitle・additionalContext の JSON を 1 つだけ出す。結べたあとは記録を読み進めず、文だけ出す
func TestTalkedBindsTheSessionAndWelcomes(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "t.jsonl")
	// 結ぶ uuid は、後ろから 1 つ目の塊の外（先頭に近い所）にある
	line := `{"type":"x","text":"` + strings.Repeat("a", 1000) + `"}` + "\n"
	body := `{"type":"tool_use","input":{"link":"6f1c2a3e-1111-4222-8333-444455556666"}}` + "\n" + strings.Repeat(line, 600)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	f := &fakeTalk{}
	var out bytes.Buffer
	talked(&out, hookInput{SessionID: "S1", TranscriptPath: path, Titled: true}, "NOTE", formatHook, f.api)
	var got struct {
		SystemMessage string `json:"systemMessage"`
		Special       struct {
			Event   string `json:"hookEventName"`
			Title   string `json:"sessionTitle"`
			Context string `json:"additionalContext"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("not one JSON: %q", out.String())
	}
	if got.SystemMessage != "matomezu に参加しました。ワークルーム名: ひよこ" || got.Special.Title != "ひよこ M-0001 作業" || got.Special.Event != "UserPromptSubmit" ||
		got.Special.Context != "You joined matomezu. Workroom name: ひよこ\nNOTE" {
		t.Fatalf("output = %s", out.String())
	}
	// ターンの始まりを知らせる 1 回と、uuid が見つかった塊の 1 回だけ（uuid の無い塊は送らない）
	if len(f.bodies) != 2 || f.bodies[0]["candidates"] != nil || f.bodies[1]["candidates"] == nil {
		t.Fatalf("calls = %v", f.bodies)
	}
	// 結べたあと: 伝え済みなので文だけ（記録は読まない）
	f.bodies = nil
	out.Reset()
	talked(&out, hookInput{SessionID: "S1", TranscriptPath: path}, "NOTE", formatHook, f.api)
	if out.String() != "NOTE\n" || len(f.bodies) != 1 {
		t.Fatalf("after: %q, calls %v", out.String(), f.bodies)
	}
}

// チャットスレッドの id を読む物があれば、ターンの始まりの知らせにも、会話の記録から結ばせる知らせにも、読んだ id を添える（読めなければ添えない）。常駐が返す AI にだけの文は additionalContext に入る
func TestTalkedSendsTheChatThread(t *testing.T) {
	var bodies []map[string]any
	api := func(body []byte) ([]byte, error) {
		var m map[string]any
		_ = json.Unmarshal(body, &m)
		bodies = append(bodies, m)
		if m["candidates"] == nil {
			return []byte(`{"welcomes":[],"forAi":"CARRIED","unbound":true}`), nil
		}
		return []byte(`{"welcomes":[]}`), nil
	}
	transcript := filepath.Join(t.TempDir(), "t.jsonl")
	if err := os.WriteFile(transcript, []byte(`{"link":"11111111-2222-3333-4444-555555555555"}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	thread := func(host, session string) string {
		if host != "300" || session != "S2" {
			t.Fatalf("read %q %q", host, session)
		}
		return "T1"
	}
	talked(&out, hookInput{SessionID: "S2", Host: "300", TranscriptPath: transcript, Thread: thread}, "", formatHook, api)
	if len(bodies) != 2 || bodies[0]["chatThread"] != "T1" || bodies[1]["chatThread"] != "T1" || !strings.Contains(out.String(), `"additionalContext":"CARRIED"`) || strings.Contains(out.String(), "systemMessage") {
		t.Fatalf("calls = %v, out = %s", bodies, out.String())
	}
	bodies = nil
	talked(&out, hookInput{SessionID: "S2", Thread: func(string, string) string { return "" }}, "", formatHook, api)
	if len(bodies) != 1 || bodies[0]["chatThread"] != nil {
		t.Fatalf("calls = %v", bodies)
	}
}

// 常駐が無いときと、伝えることが無いときは、渡された文だけを書く（文も無ければ何も書かない）
func TestTalkedWithoutNewsPrintsTheContextOnly(t *testing.T) {
	var out bytes.Buffer
	talked(&out, hookInput{}, "NOTE\n", formatHook, nil)
	if out.String() != "NOTE\n" {
		t.Fatalf("out = %q", out.String())
	}
	out.Reset()
	talked(&out, hookInput{SessionID: "S1"}, "", formatHook, (&fakeTalk{bound: true, told: true}).api)
	if out.String() != "" {
		t.Fatalf("out = %q", out.String())
	}
}

// モデルのフックは、SessionStart の model と PostModelSwitch の to_model を、セッション id とAI のプログラムのプロセス id を添えて送る。どちらも無ければ送らない
func TestModelHookSendsTheModel(t *testing.T) {
	var sent []string
	api := func(body []byte) ([]byte, error) { sent = append(sent, string(body)); return []byte("{}"), nil }
	for _, in := range []string{
		`{"session_id":"S1","hook_event_name":"SessionStart","model":"claude-opus-5-5"}`,
		`{"session_id":"S1","hook_event_name":"PostModelSwitch","from_model":"claude-opus-5-5","to_model":"claude-sonnet-5"}`,
		`{"session_id":"S2","hook_event_name":"SessionStart","source":"clear"}`,
	} {
		hook := readHookInput(strings.NewReader(in))
		hook.Host = "100"
		sendModel(hook, api)
	}
	want := []string{
		`{"host":"100","model":"claude-opus-5-5","sessionId":"S1"}`,
		`{"host":"100","model":"claude-sonnet-5","sessionId":"S1"}`,
	}
	if strings.Join(sent, "\n") != strings.Join(want, "\n") {
		t.Fatalf("sent = %v", sent)
	}
}

// 裏の知らせで始まったターン（--woken を渡したフックか、AI の事情で入力から見分けた物。hookPrompt）は woken を付けて知らせる。利用者トリガートークには付けない
func TestTalkedTellsWhetherTheTurnWasWoken(t *testing.T) {
	for _, c := range []struct {
		hook  hookInput
		woken bool
	}{
		{hookInput{SessionID: "S1", Prompt: "matomezu: the user accepted your request to join", Woken: true}, true},
		{hookInput{SessionID: "S1", Prompt: "こんにちは"}, false},
	} {
		f := &fakeTalk{bound: true, told: true}
		talked(&bytes.Buffer{}, c.hook, "", formatHook, f.api)
		if len(f.bodies) != 1 || f.bodies[0]["woken"] != c.woken {
			t.Errorf("%q (flag %v): calls = %v", c.hook.Prompt, c.hook.Woken, f.bodies)
		}
	}
}

// --format split: 利用者に見せる文・AI に足す文・題名を分けた 1 つの JSON。伝えることが無ければ context だけを forAi に、それも題名も無ければ何も書かない
func TestTalkedSplitAnswer(t *testing.T) {
	welcome := func([]byte) ([]byte, error) {
		return []byte(`{"welcomes":[{"workroom":"ひよこ","message":"参加しました","forAi":"You joined"}],"unbound":false,"workTitle":"ひよこ（空き）"}`), nil
	}
	var out bytes.Buffer
	talked(&out, hookInput{SessionID: "S1"}, "NOTE\n", formatSplit, welcome)
	if out.String() != `{"message":"参加しました","forAi":"You joined\nNOTE","sessionTitle":"ひよこ（空き）"}`+"\n" {
		t.Fatalf("welcome: %q", out.String())
	}
	out.Reset()
	talked(&out, hookInput{SessionID: "S1"}, "NOTE\n", formatSplit, nil)
	if out.String() != `{"forAi":"NOTE"}`+"\n" {
		t.Fatalf("context only: %q", out.String())
	}
	out.Reset()
	// 伝えることが無くても、作業名は毎ターン書く
	talked(&out, hookInput{SessionID: "S1"}, " \n", formatSplit, (&fakeTalk{bound: true, told: true}).api)
	if out.String() != `{"sessionTitle":"ひよこ M-0001 作業"}`+"\n" {
		t.Fatalf("title only: %q", out.String())
	}
	out.Reset()
	talked(&out, hookInput{SessionID: "S1"}, " \n", formatSplit, func([]byte) ([]byte, error) { return []byte(`{"welcomes":[]}`), nil })
	if out.String() != "" {
		t.Fatalf("nothing: %q", out.String())
	}
}

// 出力のイベント名は、入力のイベント名に合わせる（Gemini CLI の BeforeAgent。無ければ UserPromptSubmit）
func TestTalkedEchoesTheHookEventName(t *testing.T) {
	for _, c := range []struct{ in, want string }{{"", "UserPromptSubmit"}, {"UserPromptSubmit", "UserPromptSubmit"}, {"BeforeAgent", "BeforeAgent"}} {
		welcome := func([]byte) ([]byte, error) {
			return []byte(`{"welcomes":[{"workroom":"ひよこ","message":"m","forAi":"a"}],"unbound":false}`), nil
		}
		var out bytes.Buffer
		talked(&out, hookInput{SessionID: "S1", HookEventName: c.in}, "NOTE", formatHook, welcome)
		var got struct {
			Special struct {
				Event string `json:"hookEventName"`
			} `json:"hookSpecificOutput"`
		}
		if err := json.Unmarshal(out.Bytes(), &got); err != nil || got.Special.Event != c.want {
			t.Errorf("event %q: got %q (%v) in %s", c.in, got.Special.Event, err, out.String())
		}
	}
}

// ツールを使う前のフック: 読むだけの matomezu の MCP 公開ツール（自分で登録した物もプラグインの物も）は聞かずに通し、変える物・画面を切り替える物・参加を頼む物・ほかのツールには何も言わない
func TestPermissionAllowsOnlyTheToolsThatRead(t *testing.T) {
	for tool, allowed := range map[string]bool{
		"mcp__matomezu__list_books":                  true,
		"mcp__plugin_matomezu_matomezu__read_page":   true,
		"mcp__plugin_matomezu_matomezu__read_folder": true,
		"mcp__plugin_matomezu_matomezu__search":      true,
		"mcp__plugin_matomezu_matomezu__perform":     false,
		"mcp__plugin_matomezu_matomezu__show":        false,
		"mcp__plugin_matomezu_matomezu__join":        false,
		"mcp__other__list_books":                     false,
		"Bash":                                       false,
		"mcp__plugin_matomezu_matomezu__":            false,
	} {
		var out bytes.Buffer
		permission(&out, readHookInput(strings.NewReader(`{"tool_name":"`+tool+`"}`)))
		if allowed != strings.Contains(out.String(), `"permissionDecision":"allow"`) {
			t.Errorf("%s: allowed = %v, out = %q", tool, allowed, out.String())
		}
		if !allowed && out.String() != "" {
			t.Errorf("%s: should say nothing, said %q", tool, out.String())
		}
	}
}

// sessionTitle は、それを読む AI のプログラム（Titled）にだけ書く。Codex は知らない項目のある答えを捨てる
func TestTalkedWritesTheTitleOnlyWhenTitled(t *testing.T) {
	welcome := func([]byte) ([]byte, error) {
		return []byte(`{"welcomes":[{"workroom":"ひよこ","message":"m","forAi":"a"}],"unbound":false,"workTitle":"ひよこ（空き）"}`), nil
	}
	for _, titled := range []bool{true, false} {
		var out bytes.Buffer
		talked(&out, hookInput{SessionID: "S1", Titled: titled}, "", formatHook, welcome)
		if got := strings.Contains(out.String(), `"sessionTitle"`); got != titled {
			t.Errorf("titled %v: %s", titled, out.String())
		}
	}
}

// 常駐が知らせで始まったターンと答えたら、利用者に見せる文は無く、AI に伝える文だけの JSON を書く（渡された文も添える）
func TestTalkedPassesTheWokenNoteToTheAI(t *testing.T) {
	api := func([]byte) ([]byte, error) {
		return []byte(`{"welcomes":[],"unbound":false,"forAi":"NOT THE USER"}`), nil
	}
	var out bytes.Buffer
	talked(&out, hookInput{SessionID: "S1", Prompt: "matomezu from AI \"a\": \"x\""}, "NOTE", formatHook, api)
	var got map[string]any
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatalf("not one JSON: %q", out.String())
	}
	special, _ := got["hookSpecificOutput"].(map[string]any)
	if _, ok := got["systemMessage"]; ok || special["additionalContext"] != "NOT THE USER\nNOTE" {
		t.Fatalf("output = %s", out.String())
	}
}

// 作業名は、伝えることが無いターンでも毎ターン書く（Titled の AI のプログラムだけ。Codex は文のまま）。
// 名前があれば、答えを書いたあとに、ADE のワークスペースの表示名にも書く。名前が無ければ（設定が止めている・参加していない）どちらも書かない
func TestTalkedWritesTheTitleEveryTurn(t *testing.T) {
	titled := func([]byte) ([]byte, error) {
		return []byte(`{"welcomes":[],"unbound":false,"workTitle":"ひよこ M-0001 作業"}`), nil
	}
	untitled := func([]byte) ([]byte, error) { return []byte(`{"welcomes":[],"unbound":false}`), nil }
	var renamed []string
	rename := func(dir, name string) { renamed = append(renamed, dir+"|"+name) }
	var out bytes.Buffer
	talked(&out, hookInput{SessionID: "S1", Titled: true, Cwd: "/w", Rename: rename}, "NOTE", formatHook, titled)
	var got struct {
		Special struct {
			Title   string `json:"sessionTitle"`
			Context string `json:"additionalContext"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(out.Bytes(), &got); err != nil || got.Special.Title != "ひよこ M-0001 作業" || got.Special.Context != "NOTE" {
		t.Fatalf("titled: %q", out.String())
	}
	if len(renamed) != 1 || renamed[0] != "/w|ひよこ M-0001 作業" {
		t.Fatalf("renamed = %v", renamed)
	}
	// Codex: 答えは文のまま。表示名には書く
	out.Reset()
	talked(&out, hookInput{SessionID: "S1", Cwd: "/w", Rename: rename}, "NOTE", formatHook, titled)
	if out.String() != "NOTE\n" || len(renamed) != 2 {
		t.Fatalf("codex: %q, renamed = %v", out.String(), renamed)
	}
	// 名前が無ければ、どちらも書かない
	out.Reset()
	talked(&out, hookInput{SessionID: "S1", Titled: true, Cwd: "/w", Rename: rename}, "NOTE", formatHook, untitled)
	if out.String() != "NOTE\n" || len(renamed) != 2 {
		t.Fatalf("untitled: %q, renamed = %v", out.String(), renamed)
	}
}

// ワークルームから外れた会話の名前は、セッション名にだけ書き、ADE のワークスペースの表示名には書かない（同じフォルダの、今の会話の名前を変えない）
func TestTalkedWritesTheLeftTitleOnlyToTheSession(t *testing.T) {
	left := func([]byte) ([]byte, error) {
		return []byte(`{"welcomes":[],"unbound":false,"forAi":"You are no longer a participant","leftTitle":"ひよこ（外れた）"}`), nil
	}
	var renamed []string
	rename := func(dir, name string) { renamed = append(renamed, dir+"|"+name) }
	var out bytes.Buffer
	talked(&out, hookInput{SessionID: "S1", Titled: true, Cwd: "/w", Rename: rename}, "", formatHook, left)
	var got struct {
		Special struct {
			Title   string `json:"sessionTitle"`
			Context string `json:"additionalContext"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(out.Bytes(), &got); err != nil || got.Special.Title != "ひよこ（外れた）" || got.Special.Context != "You are no longer a participant" {
		t.Fatalf("output = %q", out.String())
	}
	if len(renamed) != 0 {
		t.Fatalf("renamed = %v", renamed)
	}
}

// ターンの終わりのフック: 常駐に作業名を訊き、表示名に書く。何も出さない。名前が無い・常駐が無ければ書かない
func TestStopRenamesTheAdeWorkspace(t *testing.T) {
	var renamed []string
	rename := func(dir, name string) { renamed = append(renamed, dir+"|"+name) }
	var asked map[string]any
	api := func(body []byte) ([]byte, error) {
		_ = json.Unmarshal(body, &asked)
		return []byte(`{"workTitle":"ひよこ（空き）"}`), nil
	}
	workTitle(hookInput{SessionID: "S1", Cwd: "/w", Rename: rename}, api)
	if asked["sessionId"] != "S1" || len(renamed) != 1 || renamed[0] != "/w|ひよこ（空き）" {
		t.Fatalf("asked %v, renamed %v", asked, renamed)
	}
	workTitle(hookInput{SessionID: "S1", Cwd: "/w", Rename: rename}, func([]byte) ([]byte, error) { return []byte(`{"workTitle":""}`), nil })
	workTitle(hookInput{SessionID: "S1", Cwd: "/w", Rename: rename}, nil)
	if len(renamed) != 1 {
		t.Fatalf("renamed %v", renamed)
	}
}
