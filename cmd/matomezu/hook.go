package main

// 話しかけのフック（talked）: AI の話しかけのフック（Claude Code の UserPromptSubmit・Gemini CLI の BeforeAgent）が標準入力に渡す JSON（session_id・transcript_path）から、
// ターンの始まりを常駐に知らせ、会話の記録から使い捨ての uuid を拾って参加者にセッション id を結ばせ、結べた参加者を利用者に伝える。
// 伝えるのはフックの JSON の出力（systemMessage が利用者に見え、sessionTitle が Claude Code のセッション名になり、additionalContext が AI に届く）。
// --format split では、AI の種類を問わない JSON（message は利用者に見せる文、forAi は AI に足す文、sessionTitle は会話の題名）を出し、
// AI の側の部品（opencode のプラグインなど）が、その AI のプログラムでの見せ方・渡し方を決める。
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
	"net/http"
	"os"
	"regexp"
	"strings"

	claudelaunch "github.com/umaxyon/matomezu/clients/claude-code/launch"
	"github.com/umaxyon/matomezu/internal/mcp"
)

type talkedCmd struct {
	Context string `help:"Text the hook adds to what it tells AI (such as the output of annotations). It is printed as it is when there is nothing to say as JSON."`
	Host    string `help:"Process id of AI's host program (such as Claude Code). The server ties a new session id of the same process to its participant (after /clear)."`
	Format  string `default:"hook" enum:"hook,split" help:"Shape of the answer: hook (the hook's JSON that Claude Code, Codex and Gemini CLI read; --context as it is when there is nothing else to say) or split (one JSON for any AI program: message to show the user, forAi to add to what AI reads this turn, sessionTitle for the conversation; nothing when all are empty)."`
	Woken   bool   `help:"The turn was started by a wake notice (such as matomezu deliver), not by the user talking."`
}

type modelCmd struct {
	Host string `help:"Process id of AI's host program (such as Claude Code). The server ties a new session id of the same process to its participant (after /clear)."`
}

// Run は、AI のターンの始まりを常駐に知らせる（AI のフックが呼ぶ。フックの JSON が標準入力に来る）。
// 常駐を立てず、立っていない・答えないときは何もしない（AI のターンを止めない。--context があればそれだけ書く）
func (c *talkedCmd) Run() error {
	hook := stdinHook()
	hook.Host = c.Host
	hook.Woken = c.Woken
	talked(os.Stdout, hook, c.Context, c.Format, runningAPI("api/ai/talked"))
	return nil
}

// Run は、AI のセッションのモデルを常駐に知らせる（AI のフックが呼ぶ。フックの JSON が標準入力に来る）。
// 常駐を立てず、立っていない・答えないときは何もしない
func (c *modelCmd) Run() error {
	hook := stdinHook()
	hook.Host = c.Host
	sendModel(hook, runningAPI("api/ai/model"))
	return nil
}

// stdinHook は、標準入力に来たフックの JSON（端末なら読まない）
func stdinHook() hookInput {
	if in, err := os.Stdin.Stat(); err == nil && in.Mode()&os.ModeCharDevice == 0 {
		return readHookInput(os.Stdin)
	}
	return hookInput{}
}

// runningAPI は、立っている常駐の POST path を呼ぶ口（立っていなければ nil。常駐を立てない）
func runningAPI(path string) hookAPI {
	h, err := openHome()
	if err != nil {
		return nil
	}
	s, err := running(h)
	if err != nil || s == nil {
		return nil
	}
	return func(body []byte) ([]byte, error) {
		out, _, _, err := send(s, http.MethodPost, path, body, nil)
		return out, err
	}
}

// hookInput はフックの標準入力の JSON のうち、使う所
type hookInput struct {
	SessionID      string `json:"session_id"`
	TranscriptPath string `json:"transcript_path"`
	HookEventName  string `json:"hook_event_name"`  // 話しかけのフックのイベント名（Claude Code は UserPromptSubmit、Gemini CLI は BeforeAgent。無ければ UserPromptSubmit）
	Model          string `json:"model"`            // SessionStart のモデル
	ToModel        string `json:"to_model"`         // PostModelSwitch の、切り替えた先のモデル
	Prompt         string `json:"prompt"`           // 話しかけのフックの、ターンを始めた入力
	ToolName       string `json:"tool_name"`        // ツールを使う前のフックの、使うツールの名前
	Host           string `json:"-"`                // AI のプログラムのプロセス id（フックが --host で渡す）
	Woken          bool   `json:"-"`                // 起こす知らせで始まったターン（フックが --woken で渡す。渡せない AI のプログラムは、その AI の事情で入力から見分ける。hookPrompt。知らせをそのまま入力の道で受ける AI のプログラムは、talked に添える入力を常駐が照らす）
	Titled         bool   `json:"-"`                // formatHook の答えに sessionTitle を書くか（それを読む AI のプログラムだけ。知らない項目のある JSON を断る AI がある）
	Cwd            string `json:"cwd"`              // AI のセッションのフォルダ
	AgentID        string `json:"agent_id"`         // サブエージェントの中のフックなら、そのサブエージェントの id（Claude Code）
	StopHookActive bool   `json:"stop_hook_active"` // ターンの終わりのフックが止めて続けさせた続きのターンの終わり（Claude Code）
	// Rename は、作業名を ADE のワークスペースの表示名にも書く（dir は AI のセッションのフォルダ。答えを書いたあとに呼ぶ。nil なら書かない）
	Rename func(dir, name string) `json:"-"`
	// Thread は、プロセス id host の AI のプログラムがセッション session で動いているときの、チャットスレッドの id（その AI の事情で読む。nil か空なら送らない）
	Thread func(host, session string) string `json:"-"`
	// Refreshable は、AI のプログラムが会話を空にできる（プラグインの部品がリフレッシュリクエストを受けて空にする。話しかけに添えて名乗る）
	Refreshable bool `json:"-"`
}

// eventName は、フックの出力に書くイベント名（入力のイベント名。無ければ UserPromptSubmit）
func (in hookInput) eventName() string {
	if in.HookEventName != "" {
		return in.HookEventName
	}
	return "UserPromptSubmit"
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
	Unbound   bool   `json:"unbound"`
	ForAI     string `json:"forAi"`     // 知らせで始まったターンなら、AI に伝える文
	WorkTitle string `json:"workTitle"` // 作業名（セッション名に書く。書かないなら空）
	LeftTitle string `json:"leftTitle"` // ワークルームから外れた会話のセッション名（セッション名だけに書き、ADE のワークスペースの表示名には書かない。書かないなら空）
}

const (
	// chunkBytes は、会話の記録を後ろから読む 1 度の大きさ
	chunkBytes = 256 << 10
	// scanBytes は、会話の記録を後ろから読む合計の上限
	scanBytes = 8 << 20
)

var uuidShape = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// 話しかけのフックの答えの形（talked の --format）
const (
	formatHook  = "hook"  // AI のフックの JSON（Claude Code・Codex・Gemini CLI のフックが読む形）。伝えることが無ければ context だけを文のまま
	formatSplit = "split" // AI の種類を問わない JSON（利用者に見せる文・AI に足す文・題名を分けた物）。伝えることも context も無ければ何も書かない
)

// talkedSplit は、--format split の答え（無い物は書かない）
type talkedSplit struct {
	Message      string `json:"message,omitempty"`      // 利用者に見せる文
	ForAI        string `json:"forAi,omitempty"`        // AI に足す文（このターンの AI への入力に添える）
	SessionTitle string `json:"sessionTitle,omitempty"` // 会話の題名（常駐が決めた作業名）
}

// talked はターンの始まりを常駐に知らせ、out に答えの形 format（formatHook か formatSplit）で書く。context は、フックが AI に添える文（annotations の出力など）。
// formatHook では、伝えることがあるときは 1 つの JSON を書き（利用者に見せる文が無ければ systemMessage は書かない）、無ければ context だけをそのまま書く（フックの出力は JSON か文のどちらか 1 つ）
func talked(out io.Writer, hook hookInput, context, format string, api hookAPI) {
	var reply talkReply
	if api != nil {
		reply = askTalked(hook, api)
	}
	var say, ai []string
	if reply.ForAI != "" {
		ai = append(ai, reply.ForAI)
	}
	for _, w := range reply.Welcomes {
		say = append(say, w.Message)
		ai = append(ai, w.ForAI)
	}
	// セッション名に書く作業名は常駐が決める（結ばれた参加者が 1 人で、利用者の設定が書き換えを止めていないときだけ。元のセッション名は常駐の参加者が持っている）
	title := reply.WorkTitle
	if title != "" && hook.Rename != nil {
		defer hook.Rename(hook.Cwd, title)
	}
	if title == "" {
		title = reply.LeftTitle
	}
	forAI := strings.TrimSpace(strings.Join(append(ai, context), "\n"))
	if format == formatSplit {
		split := talkedSplit{Message: strings.Join(say, "\n"), ForAI: forAI, SessionTitle: title}
		if split != (talkedSplit{}) {
			_ = json.NewEncoder(out).Encode(split)
		}
		return
	}
	if len(reply.Welcomes) == 0 && reply.ForAI == "" && (title == "" || !hook.Titled) {
		if strings.TrimSpace(context) != "" {
			fmt.Fprintln(out, strings.TrimRight(context, "\n"))
		}
		return
	}
	special := map[string]any{"hookEventName": hook.eventName(), "additionalContext": forAI}
	if title != "" && hook.Titled {
		special["sessionTitle"] = title
	}
	answer := map[string]any{"hookSpecificOutput": special}
	if len(say) > 0 {
		answer["systemMessage"] = strings.Join(say, "\n")
	}
	_ = json.NewEncoder(out).Encode(answer)
}

// askTalked は、ターンの始まりを知らせ、結ばれていない参加者がいるなら会話の記録を後ろから調べて結ばせる。チャットスレッドの id が分かれば、どの呼び出しにも添える
// （常駐は、結んだ参加者に覚え、この会話が誰にも結ばれていなければ、同じチャットスレッドの参加者を移す）。常駐の答えが読めなければ空を返す
func askTalked(hook hookInput, api hookAPI) talkReply {
	var reply talkReply
	thread := ""
	if hook.Thread != nil {
		thread = hook.Thread(hook.Host, hook.SessionID)
	}
	first := map[string]any{"sessionId": hook.SessionID, "host": hook.Host, "woken": hook.Woken, "prompt": hook.Prompt}
	if thread != "" {
		first["chatThread"] = thread
	}
	if hook.Refreshable {
		first["refreshable"] = true
	}
	body, _ := json.Marshal(first)
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
		ask := map[string]any{"sessionId": hook.SessionID, "host": hook.Host, "candidates": found}
		if thread != "" {
			ask["chatThread"] = thread
		}
		body, _ := json.Marshal(ask)
		out, err := api(body)
		var next talkReply
		if err != nil || json.Unmarshal(out, &next) != nil {
			break
		}
		reply.Unbound = next.Unbound
		reply.Welcomes = append(reply.Welcomes, next.Welcomes...)
		if next.WorkTitle != "" { // 結べたら、作業名も決まる
			reply.WorkTitle = next.WorkTitle
		}
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

// contextUnknown は、POST /api/ai/context-use の contextUse の、量か物差しが読めないときの値
const contextUnknown = "unknown"

// contextUse は、POST /api/ai/context-use の contextUse の、読めたときの値（server の contextUse と同じ形）
type contextUse struct {
	Used    int64 `json:"used"`
	AIScale int64 `json:"aiScale"`
}

// contextReader は、フックの入力から、そのセッションの今のコンテキストの量と AI の側の物差しを読む物（その AI の事情。読めなければ ok が偽）
type contextReader func(hook hookInput) (use contextUse, ok bool)

// sendContextUse は、セッションの今のコンテキストの量と物差しを常駐に送る（読めなければ読めないと送る）。何も書かない（AI のコンテキストを使わない）。
// 常駐が立っていない・セッション id が無い・サブエージェントの中のフックなら、読まずに何もしない（答えは読まない）
func sendContextUse(hook hookInput, read contextReader, api hookAPI) {
	if api == nil || hook.SessionID == "" || hook.AgentID != "" {
		return
	}
	var value any = contextUnknown
	if use, ok := read(hook); ok {
		value = use
	}
	body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID, "host": hook.Host, "contextUse": value})
	_, _ = api(body)
}

// permission は、ツールを使う前のフックの出力。読むだけの matomezu の MCP 公開ツール（MCP 公開ツールの表の印）なら、聞かずに使ってよいと答える。ほかのツールには何も言わず、利用者に聞く。
// ツールの名前と答えの形は Claude Code の物（clients/claude-code）
func permission(out io.Writer, hook hookInput) {
	if name, ok := claudelaunch.MatomezuTool(hook.ToolName); ok && mcp.ReadOnly(name) {
		claudelaunch.AllowTool(out, "matomezu tool that only reads")
	}
}

// workTitle は、ターンの終わりのフック: 常駐に作業名を訊き、ADE のワークスペースの表示名に書く（何も出さない。常駐が立っていない・名前が無ければ何もしない）
func workTitle(hook hookInput, api hookAPI) {
	if api == nil || hook.SessionID == "" || hook.Rename == nil {
		return
	}
	body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID})
	out, err := api(body)
	var reply struct {
		WorkTitle string `json:"workTitle"`
	}
	if err != nil || json.Unmarshal(out, &reply) != nil || reply.WorkTitle == "" {
		return
	}
	hook.Rename(hook.Cwd, reply.WorkTitle)
}

// refreshDue は、セッション session の AI が受けたリフレッシュリクエストの、空にしたあとに打つ文を常駐に訊いて 1 行出す（無い・届かなければ何も出さない）
func refreshDue(out io.Writer, session string, api hookAPI) {
	if api == nil || session == "" {
		return
	}
	body, _ := json.Marshal(map[string]any{"sessionId": session})
	got, err := api(body)
	var reply struct {
		Text string `json:"text"`
	}
	if err != nil || json.Unmarshal(got, &reply) != nil || reply.Text == "" {
		return
	}
	fmt.Fprintln(out, reply.Text)
}
