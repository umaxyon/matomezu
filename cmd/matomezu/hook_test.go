package main

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
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
	talked(&out, hookInput{SessionID: "S1", TranscriptPath: path}, "NOTE", f.api)
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
	if got.SystemMessage != "matomezu に参加しました。ワークルーム名: ひよこ" || got.Special.Title != "ひよこ" || got.Special.Event != "UserPromptSubmit" ||
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
	talked(&out, hookInput{SessionID: "S1", TranscriptPath: path}, "NOTE", f.api)
	if out.String() != "NOTE\n" || len(f.bodies) != 1 {
		t.Fatalf("after: %q, calls %v", out.String(), f.bodies)
	}
}

// 常駐が無いときと、伝えることが無いときは、渡された文だけを書く（文も無ければ何も書かない）
func TestTalkedWithoutNewsPrintsTheContextOnly(t *testing.T) {
	var out bytes.Buffer
	talked(&out, hookInput{}, "NOTE\n", nil)
	if out.String() != "NOTE\n" {
		t.Fatalf("out = %q", out.String())
	}
	out.Reset()
	talked(&out, hookInput{SessionID: "S1"}, "", (&fakeTalk{bound: true, told: true}).api)
	if out.String() != "" {
		t.Fatalf("out = %q", out.String())
	}
}

// フックのスクリプト: アノテーションの文は talked の --context に渡り、フックの標準入力はそのまま talked に届く。常駐の実行ファイルが無ければ何も出さない
func TestAnnotationsHookScript(t *testing.T) {
	script, err := filepath.Abs("../../.claude/hooks/annotations.sh")
	if err != nil {
		t.Fatal(err)
	}
	repo := t.TempDir()
	if out, err := exec.Command("git", "-C", repo, "init", "-q").CombinedOutput(); err != nil {
		t.Skipf("git: %v %s", err, out)
	}
	// 引数は Claude Code のプロセス id（フックのコマンドの $PPID）。talked に --host で渡る
	run := func(stdin string) string {
		cmd := exec.Command("sh", script, "123")
		cmd.Env = append(os.Environ(), "CLAUDE_PROJECT_DIR="+repo)
		cmd.Stdin = strings.NewReader(stdin)
		out, err := cmd.Output()
		if err != nil {
			t.Fatal(err)
		}
		return string(out)
	}
	if got := run("{}"); got != "" {
		t.Fatalf("without the server's executable = %q", got)
	}
	home := filepath.Join(repo, ".dev-home")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	fake := `#!/bin/sh
case "$1" in
annotations) printf '%s' "$FAKE_NOTES" ;;
talked) in=$(cat); printf 'talked[%s][%s][%s][%s]' "$2" "$3" "$4" "$5" ; printf '%s' "$in" > "$FAKE_STDIN" ;;
esac
`
	if err := os.WriteFile(filepath.Join(home, "matomezu"), []byte(fake), 0o755); err != nil {
		t.Fatal(err)
	}
	stdinFile := filepath.Join(t.TempDir(), "stdin")
	t.Setenv("FAKE_STDIN", stdinFile)
	for notes, want := range map[string]string{"": "talked[--host][123][--context][]", "NOTE": "talked[--host][123][--context][NOTE]"} {
		t.Setenv("FAKE_NOTES", notes)
		if got := run(`{"session_id":"S1"}`); got != want {
			t.Fatalf("notes %q: out = %q, want %q", notes, got, want)
		}
		if b, _ := os.ReadFile(stdinFile); string(b) != `{"session_id":"S1"}` {
			t.Fatalf("talked's stdin = %q", b)
		}
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

// 裏の知らせで始まったターン（入力が <task-notification> で始まる）は woken を付けて知らせる。利用者トリガートークには付けない
func TestTalkedTellsWhetherTheTurnWasWoken(t *testing.T) {
	f := &fakeTalk{bound: true, told: true}
	for _, prompt := range []string{"<task-notification>\n<summary>Monitor event: \"matomezu\"</summary>\n</task-notification>", "こんにちは"} {
		talked(&bytes.Buffer{}, hookInput{SessionID: "S1", Prompt: prompt}, "", f.api)
	}
	if len(f.bodies) != 2 || f.bodies[0]["woken"] != true || f.bodies[1]["woken"] != false {
		t.Fatalf("calls = %v", f.bodies)
	}
}
