package main

// 話しかけのフック（talked）: AI の話しかけのフック（Claude Code の UserPromptSubmit・Gemini CLI の BeforeAgent）が標準入力に渡す JSON（session_id・transcript_path）から、
// ターンの始まりを常駐に知らせ、会話の記録から使い捨ての uuid を拾って参加者にセッション id を結ばせ、結べた参加者を利用者に伝える。
// 伝えるのはフックの JSON の出力（systemMessage が利用者に見え、sessionTitle が Claude Code のセッション名になり、additionalContext が AI に届く）。
//
// モデルのフック（model）: AI の SessionStart と PostModelSwitch のフックが標準入力に渡す JSON（session_id と、model か to_model）から、
// セッションのモデルを常駐に知らせる（参加者の様子に出す）。
//
// どちらも、フックが --host で渡す AI のプログラム（Claude Code など）のプロセス id を添える。常駐は、セッション id が変わったとき（/clear など）、
// 同じプロセス id の参加者に新しいセッション id を結び直す

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
)

// hookInput はフックの標準入力の JSON のうち、使う所
type hookInput struct {
	SessionID      string `json:"session_id"`
	TranscriptPath string `json:"transcript_path"`
	HookEventName  string `json:"hook_event_name"` // 話しかけのフックのイベント名（Claude Code は UserPromptSubmit、Gemini CLI は BeforeAgent。無ければ UserPromptSubmit）
	Model          string `json:"model"`           // SessionStart のモデル
	ToModel        string `json:"to_model"`        // PostModelSwitch の、切り替えた先のモデル
	Prompt         string `json:"prompt"`          // 話しかけのフックの、ターンを始めた入力
	ToolName       string `json:"tool_name"`       // 道具を使う前のフックの、使う道具の名前
	Host           string `json:"-"`               // AI のプログラムのプロセス id（フックが --host で渡す）
}

// eventName は、フックの出力に書くイベント名（入力のイベント名。無ければ UserPromptSubmit）
func (in hookInput) eventName() string {
	if in.HookEventName != "" {
		return in.HookEventName
	}
	return "UserPromptSubmit"
}

// woken は、ターンが利用者トリガートークでなく、裏の知らせ（plugin の monitor の 1 行・裏で走らせた物の終わりなど）で始まったか
// （Claude Code は、その入力を <task-notification> で包んで渡す）
func (in hookInput) woken() bool {
	return strings.HasPrefix(strings.TrimSpace(in.Prompt), "<task-notification>")
}

// model は、フックが知らせるモデル（切り替えた先があればそれ。どちらも無ければ空）
func (in hookInput) model() string {
	if in.ToModel != "" {
		return in.ToModel
	}
	return in.Model
}

func readHookInput(r io.Reader) hookInput {
	var in hookInput
	b, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err == nil {
		_ = json.Unmarshal(b, &in)
	}
	return in
}

// hookAPI は、フックが使う常駐の AI の入口の 1 つ（POST /api/ai/talked か /api/ai/model）を呼ぶ口（常駐が立っていなければ nil）
type hookAPI func(body []byte) ([]byte, error)

// talkReply は、常駐の /api/ai/talked の答え（server.SessionTalk と同じ形）
type talkReply struct {
	Welcomes []struct {
		Workroom string `json:"workroom"`
		Message  string `json:"message"`
		ForAI    string `json:"forAi"`
	} `json:"welcomes"`
	Unbound bool `json:"unbound"`
}

const (
	// chunkBytes は、会話の記録を後ろから読む 1 度の大きさ
	chunkBytes = 256 << 10
	// scanBytes は、会話の記録を後ろから読む合計の上限
	scanBytes = 8 << 20
)

var uuidShape = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// talked はターンの始まりを常駐に知らせ、out に出すものを書く。context は、フックが AI に添える文（annotations の出力など）。
// 伝えることがあるときは 1 つの JSON を書き、無ければ context だけをそのまま書く（フックの出力は JSON か文のどちらか 1 つ）
func talked(out io.Writer, hook hookInput, context string, api hookAPI) {
	var reply talkReply
	if api != nil {
		reply = askTalked(hook, api)
	}
	if len(reply.Welcomes) == 0 {
		if strings.TrimSpace(context) != "" {
			fmt.Fprintln(out, strings.TrimRight(context, "\n"))
		}
		return
	}
	var say, ai []string
	for _, w := range reply.Welcomes {
		say = append(say, w.Message)
		ai = append(ai, w.ForAI)
	}
	special := map[string]any{
		"hookEventName": hook.eventName(),
		// 参加者が 1 人なら、その名前をセッション名にする（元のセッション名は常駐の参加者が持っている）
		"additionalContext": strings.TrimSpace(strings.Join(append(ai, context), "\n")),
	}
	if len(reply.Welcomes) == 1 {
		special["sessionTitle"] = reply.Welcomes[0].Workroom
	}
	_ = json.NewEncoder(out).Encode(map[string]any{
		"systemMessage":      strings.Join(say, "\n"),
		"hookSpecificOutput": special,
	})
}

// askTalked は、ターンの始まりを知らせ、結ばれていない参加者がいるなら会話の記録を後ろから調べて結ばせる。常駐の答えが読めなければ空を返す
func askTalked(hook hookInput, api hookAPI) talkReply {
	var reply talkReply
	body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID, "host": hook.Host, "woken": hook.woken()})
	out, err := api(body)
	if err != nil || json.Unmarshal(out, &reply) != nil {
		return talkReply{}
	}
	if !reply.Unbound || hook.SessionID == "" || hook.TranscriptPath == "" {
		return reply
	}
	f, err := os.Open(hook.TranscriptPath)
	if err != nil {
		return reply
	}
	defer f.Close()
	end, err := f.Seek(0, io.SeekEnd)
	if err != nil {
		return reply
	}
	seen := map[string]bool{}
	var tail []byte // 1 つ後ろの塊の頭（塊の境目で切れた uuid を拾い直す）
	for read := int64(0); end > 0 && read < scanBytes && reply.Unbound; {
		size := min(int64(chunkBytes), end)
		buf := make([]byte, size)
		if _, err := f.ReadAt(buf, end-size); err != nil && err != io.EOF {
			break
		}
		end -= size
		read += size
		text := append(buf, tail...)
		var found []string
		for _, u := range uuidShape.FindAllString(string(text), -1) {
			if !seen[u] {
				seen[u] = true
				found = append(found, u)
			}
		}
		if len(buf) >= 36 {
			tail = append([]byte(nil), buf[:35]...)
		}
		if len(found) == 0 {
			continue
		}
		body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID, "host": hook.Host, "candidates": found})
		out, err := api(body)
		var next talkReply
		if err != nil || json.Unmarshal(out, &next) != nil {
			break
		}
		reply.Unbound = next.Unbound
		reply.Welcomes = append(reply.Welcomes, next.Welcomes...)
	}
	return reply
}

// sendModel は、フックが知らせるモデルを常駐に送る。モデルもセッション id も無いか、常駐が立っていなければ何もしない（答えは読まない）
func sendModel(hook hookInput, api hookAPI) {
	model := hook.model()
	if api == nil || model == "" || hook.SessionID == "" {
		return
	}
	body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID, "model": model, "host": hook.Host})
	_, _ = api(body)
}

// readOnlyTools は、AI が聞かずに使ってよい matomezu の道具（ブックや画面の状態を読むだけで、何も変えない）。
// 変える道具（perform）、利用者の画面を切り替える道具（show）、参加を頼む道具（join）は、利用者に聞く
var readOnlyTools = map[string]bool{
	"actions": true, "list_books": true, "read_book": true, "read_page": true,
	"read_records": true, "read_settings": true, "search": true, "view": true,
}

// matomezuToolPrefixes は、matomezu の MCP の道具の名前の前置き（Claude Code は、自分で登録した物と、プラグインが持つ物で名前が違う）
var matomezuToolPrefixes = []string{"mcp__matomezu__", "mcp__plugin_matomezu_matomezu__"}

// permission は、道具を使う前のフックの出力。読むだけの matomezu の道具なら、聞かずに使ってよいと答える。ほかの道具には何も言わず、利用者に聞く
func permission(out io.Writer, hook hookInput) {
	for _, prefix := range matomezuToolPrefixes {
		if name, ok := strings.CutPrefix(hook.ToolName, prefix); ok && readOnlyTools[name] {
			_ = json.NewEncoder(out).Encode(map[string]any{"hookSpecificOutput": map[string]any{
				"hookEventName":            "PreToolUse",
				"permissionDecision":       "allow",
				"permissionDecisionReason": "matomezu tool that only reads",
			}})
			return
		}
	}
}
