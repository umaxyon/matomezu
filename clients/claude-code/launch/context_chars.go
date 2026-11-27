package launch

// matomezu の分の目安: 会話の記録（transcript の jsonl）の中身の字数と、そのうち matomezu が足した分を数える。トークンの内訳は記録に無いので、
// 参加者リストの棒の中の matomezu の分は、この字数の割合から出す目安。
// 分母は記録の中身の字数の合計: 会話の行（利用者・AI の行と、Claude Code が会話に添えた物）と、Claude Code が記録に書く、モデルに渡した物の写し
// （システムプロンプトと最初から渡すツールの説明・後で読み込んだツールの説明・MCP の説明。modelSees）。記録に無い分は入らないので、割合は多めに出る。
// 字数は、JSON を読んだあとの文字列の rune の数（バイトで数えると日本語が 3 倍に重くなる）。
// 会話の記録の形は Claude Code が公式に約束した物ではないので、頼る所はこのファイルの名前の付いた関数に閉じ、根拠を書く。
//
// 続きから読む: 常駐が会話ごとに、中を見ない印と積んだ字数を持つ。フックはその印から続きを読み、読んだ分の字数と次の印を返す。
// 印は、次に読み始める所（バイト）と、結果をまだ読んでいない matomezu のツールの呼び出しの id（ツールの結果の行にはツールの名前が無いため）を持つ

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"
	"unicode/utf8"
)

// ContextChars は、会話の記録の中身の字数（Total）と、そのうち matomezu が足した分（Matomezu）
type ContextChars struct {
	Total    int64
	Matomezu int64
}

// CharsRead は、会話の記録を印から読んだ結果
type CharsRead struct {
	Restart bool         // 積んだ字数を捨て、Chars から数え直す（頭から読んだか、圧縮の境目を読んだ）
	Chars   ContextChars // 読んだ分の字数（Restart なら、頭か最後の圧縮の境目から後の分）
	Mark    string       // 次に読み始める印
}

// charsMark は、印の中身（常駐は中を見ない）
type charsMark struct {
	At     int64    `json:"at"`               // 次に読み始める所（バイト。読み終えた最後の行の改行の後）
	Tools  []string `json:"tools,omitempty"`  // 結果をまだ読んでいない、matomezu の MCP 公開ツールの呼び出しの id
	Skills []string `json:"skills,omitempty"` // 中身の行をまだ読んでいない、join のスキルの呼び出しの id
	Prompt int64    `json:"prompt,omitempty"` // 最後の圧縮の境目の後で数えた、システムプロンプトの写しの字数（新しい写しはこれと入れ替える）
	Loaded []string `json:"loaded,omitempty"` // 最後の圧縮の境目の後で数えた、後で読み込んだツールの名前
	MCP    []string `json:"mcp,omitempty"`    // 最後の圧縮の境目の後で数えた、説明を渡した MCP のサーバーの名前
}

// openCallsMax は、印に持つ、結果をまだ読んでいない呼び出しの id の数の上限（超えたら古い物から捨てる）
const openCallsMax = 64

func (m charsMark) encode() string {
	b, _ := json.Marshal(m)
	return string(b)
}

// ReadContextChars は、会話の記録 transcript を印 from（空なら頭）から読み、読んだ分の字数と次の印を返す。
// 印が読めない・ファイルが印の所より短い（別のファイル）ときは頭から読む。書きかけの最後の行（改行で終わっていない物）は読まない。
// sidechain（サブエージェント）の行は数えない。会話の記録が開けなければ ok が偽
func ReadContextChars(transcript, from string) (CharsRead, bool) {
	if transcript == "" {
		return CharsRead{}, false
	}
	f, err := os.Open(transcript)
	if err != nil {
		return CharsRead{}, false
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return CharsRead{}, false
	}
	var mark charsMark
	read := CharsRead{}
	if from == "" || json.Unmarshal([]byte(from), &mark) != nil || mark.At < 0 || mark.At > info.Size() {
		mark = charsMark{}
		read.Restart = true
	}
	if _, err := f.Seek(mark.At, io.SeekStart); err != nil {
		return CharsRead{}, false
	}
	r := bufio.NewReaderSize(f, 1<<16)
	for {
		line, err := r.ReadBytes('\n')
		if err != nil {
			break
		}
		mark.At += int64(len(line))
		mark.countLine(bytes.TrimSuffix(line, []byte("\n")), &read)
	}
	read.Mark = mark.encode()
	return read, true
}

// charsLine は、会話の記録の 1 行のうち、字数を数えるのに読む所
type charsLine struct {
	Type            string `json:"type"`
	Subtype         string `json:"subtype"`
	IsSidechain     bool   `json:"isSidechain"`
	IsMeta          bool   `json:"isMeta"`
	SourceToolUseID string `json:"sourceToolUseID"`
	Message         struct {
		Content json.RawMessage `json:"content"`
	} `json:"message"`
	Attachment json.RawMessage `json:"attachment"`
}

// contentBlock は、会話の行の中身（message.content の要素）のうち読む所
type contentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Thinking  string          `json:"thinking"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Input     json.RawMessage `json:"input"`
	ToolUseID string          `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
}

// countLine は、会話の記録の 1 行 line を数え、read に足す（圧縮の境目なら、積んだ物を捨てて数え直す）
func (m *charsMark) countLine(line []byte, read *CharsRead) {
	var l charsLine
	if json.Unmarshal(line, &l) != nil || l.IsSidechain {
		return
	}
	switch {
	case l.Type == "system" && l.Subtype == compactBoundary:
		read.Restart = true
		read.Chars = ContextChars{}
		m.Tools, m.Skills, m.Loaded, m.MCP = nil, nil, nil, nil
		m.Prompt = 0
	case l.Type == "user" || l.Type == "assistant":
		m.countMessage(l, read)
	case l.Type == "attachment":
		if m.modelSees(l.Attachment, read) {
			return
		}
		total, matomezu := attachmentChars(l.Attachment)
		read.Chars.Total += total
		read.Chars.Matomezu += matomezu
	}
}

// countMessage は、利用者か AI の行を数える。matomezu の分は、matomezu の MCP 公開ツールの呼び出しとその結果、join のスキルの呼び出しとその結果と中身、
// 起こす知らせの文（ターンの入力に入った物）
func (m *charsMark) countMessage(l charsLine, read *CharsRead) {
	mine := l.IsMeta && l.SourceToolUseID != "" && m.closeSkill(l.SourceToolUseID)
	var text string
	if json.Unmarshal(l.Message.Content, &text) == nil {
		n := runes(text)
		read.Chars.Total += n
		if mine {
			read.Chars.Matomezu += n
		} else {
			read.Chars.Matomezu += wakeNoticeChars(text)
		}
		return
	}
	var blocks []contentBlock
	if json.Unmarshal(l.Message.Content, &blocks) != nil {
		return
	}
	for _, b := range blocks {
		n := blockChars(b)
		read.Chars.Total += n
		switch {
		case mine:
			read.Chars.Matomezu += n
		case b.Type == "tool_use" && m.openCall(b):
			read.Chars.Matomezu += n
		case b.Type == "tool_result" && m.closeCall(b.ToolUseID):
			read.Chars.Matomezu += n
		case b.Type == "text":
			read.Chars.Matomezu += wakeNoticeChars(b.Text)
		}
	}
}

// openCall は、ツールの呼び出し b が matomezu の物（MCP 公開ツールか join のスキル）なら、結果を待つ id として印に持つ
func (m *charsMark) openCall(b contentBlock) bool {
	if _, ok := MatomezuTool(b.Name); ok {
		m.Tools = appendOpen(m.Tools, b.ID)
		return true
	}
	if isJoinSkill(b) {
		m.Skills = appendOpen(m.Skills, b.ID)
		return true
	}
	return false
}

// closeCall は、ツールの結果の呼び出しの id が matomezu の物か。MCP 公開ツールの id は印から外す。join のスキルの id は、中身の行まで持つ
func (m *charsMark) closeCall(id string) bool {
	for i, open := range m.Tools {
		if open == id {
			m.Tools = append(m.Tools[:i:i], m.Tools[i+1:]...)
			return true
		}
	}
	for _, open := range m.Skills {
		if open == id {
			return true
		}
	}
	return false
}

// closeSkill は、スキルの中身の行の呼び出しの id が join のスキルの物か（印から外す）
func (m *charsMark) closeSkill(id string) bool {
	for i, open := range m.Skills {
		if open == id {
			m.Skills = append(m.Skills[:i:i], m.Skills[i+1:]...)
			return true
		}
	}
	return false
}

func appendOpen(ids []string, id string) []string { return appendCapped(ids, id, openCallsMax) }

// joinSkill は、matomezu のプラグインの join のスキルの名前（プラグインの名前 matomezu と、skills/join のフォルダの名前）
const joinSkill = "matomezu:join"

// isJoinSkill は、ツールの呼び出し b が join のスキルを呼ぶ物か。Claude Code はスキルを Skill のツールで呼び、input.skill にスキルの名前を書く。
// 結果の行（Launching skill）のあとに、スキルの中身を isMeta の利用者の行として、sourceToolUseID に呼び出しの id を付けて書く
func isJoinSkill(b contentBlock) bool {
	if b.Name != "Skill" {
		return false
	}
	var in struct {
		Skill string `json:"skill"`
	}
	return json.Unmarshal(b.Input, &in) == nil && in.Skill == joinSkill
}

// blockChars は、会話の行の中身の要素 1 つの字数（文・考え・ツールの名前と入力・ツールの結果）
func blockChars(b contentBlock) int64 {
	switch b.Type {
	case "text":
		return runes(b.Text)
	case "thinking":
		return runes(b.Thinking)
	case "tool_use":
		return runes(b.Name) + textChars(b.Input, blockMeta)
	case "tool_result":
		return textChars(b.Content, blockMeta)
	}
	return 0
}

// blockMeta は、会話の行の中身で、会話の文でない（数えない）項目。source は絵のデータ
var blockMeta = map[string]bool{"type": true, "id": true, "tool_use_id": true, "signature": true, "source": true, "caller": true, "cache_control": true}

// attachmentMeta は、Claude Code が会話に添えた物（type attachment の行）で、会話の文でない（数えない）項目
var attachmentMeta = map[string]bool{
	"type": true, "toolUseID": true, "hookName": true, "hookEvent": true, "command": true, "stdout": true, "stderr": true,
	"exitCode": true, "durationMs": true, "uuid": true, "source_uuid": true, "delivery_id": true, "commandMode": true,
	"origin": true, "rowSource": true, "timestamp": true, "filename": true, "filePath": true, "displayPath": true,
	"taskId": true, "outputFilePath": true,
}

// modelSees は、Claude Code が記録に書く、モデルに渡した物の写し raw（type attachment の行の attachment）なら、モデルに今見えている分だけを read に足す（写しでなければ偽）。
// 同じ物が何度も載るので、写しの種類ごとに数え方を決める。根拠は、実物の記録（圧縮の境目で区切った 70 の区切り）で見た形:
//   - prompt_snapshot（システムプロンプト・最初から渡すツールの説明）: 区切りごとに 2 回（ツールの説明の無い物と有る物）載る。モデルに毎回渡す物の、
//     その時点の全部の写しなので、最後の写しだけを数える（前に数えた写しの字数と入れ替える）。matomezu の分は数えない
//   - deferred_tools_record（ToolSearch で読み込んだツールの説明）: 読み込んだときに、読み込んだツールの説明だけが載る（entries の空の行も多い）。
//     圧縮の境目のあとは、読み込んであったツールが全部載り直す。区切りの中で同じツールが二度載ることは無かったが、名前ごとに 1 度だけ数える。
//     matomezu の MCP 公開ツールの説明は matomezu の分
//   - mcp_instructions_delta（MCP のサーバーの instructions）: 区切りごとに、サーバーごとに 1 度、会話に添えて知らせる。サーバーの名前ごとに 1 度だけ数え、
//     外したと知らせた（removedNames）サーバーは、また足したときに数え直す。matomezu のサーバーの物は matomezu の分
func (m *charsMark) modelSees(raw json.RawMessage, read *CharsRead) bool {
	var a struct {
		Type         string          `json:"type"`
		SystemPrompt json.RawMessage `json:"systemPrompt"`
		CLIPrefix    string          `json:"cliPrefix"`
		Tools        json.RawMessage `json:"tools"`
		Entries      []struct {
			Name string `json:"name"`
		} `json:"entries"`
		AddedNames   []string `json:"addedNames"`
		AddedBlocks  []string `json:"addedBlocks"`
		RemovedNames []string `json:"removedNames"`
	}
	if json.Unmarshal(raw, &a) != nil {
		return false
	}
	switch a.Type {
	case "prompt_snapshot":
		n := runes(a.CLIPrefix) + textChars(a.SystemPrompt, blockMeta) + textChars(a.Tools, blockMeta)
		read.Chars.Total += n - m.Prompt
		m.Prompt = n
	case "deferred_tools_record":
		var entries struct {
			Entries []json.RawMessage `json:"entries"`
		}
		_ = json.Unmarshal(raw, &entries)
		for i, e := range a.Entries {
			if e.Name == "" || contains(m.Loaded, e.Name) {
				continue
			}
			m.Loaded = appendCapped(m.Loaded, e.Name, namesMax)
			n := textChars(entries.Entries[i], toolMeta)
			read.Chars.Total += n
			if _, ok := MatomezuTool(e.Name); ok {
				read.Chars.Matomezu += n
			}
		}
	case "mcp_instructions_delta":
		for _, name := range a.RemovedNames {
			m.MCP = remove(m.MCP, name)
		}
		for i, name := range a.AddedNames {
			if i >= len(a.AddedBlocks) || contains(m.MCP, name) {
				continue
			}
			m.MCP = appendCapped(m.MCP, name, namesMax)
			n := runes(a.AddedBlocks[i])
			read.Chars.Total += n
			if isMatomezuServer(name) {
				read.Chars.Matomezu += n
			}
		}
	default:
		return false
	}
	return true
}

// namesMax は、印に持つ、数えたツールとサーバーの名前の数の上限（超えたら古い物から捨てる。捨てた物がまた載れば二度数える）
const namesMax = 256

// toolMeta は、ツールの説明で、モデルに渡す文でない（数えない）項目
var toolMeta = map[string]bool{"type": true, "defer_loading": true, "cache_control": true}

// matomezuServers は、Claude Code が MCP の説明に付ける、matomezu の MCP のサーバーの名前（自分で登録した物と、プラグインが持つ物。toolPrefixes と同じ 2 つ）
var matomezuServers = []string{"matomezu", "plugin:matomezu:matomezu"}

func isMatomezuServer(name string) bool { return contains(matomezuServers, name) }

func contains(names []string, name string) bool {
	for _, n := range names {
		if n == name {
			return true
		}
	}
	return false
}

func remove(names []string, name string) []string {
	out := names[:0:0]
	for _, n := range names {
		if n != name {
			out = append(out, n)
		}
	}
	return out
}

func appendCapped(names []string, name string, max int) []string {
	names = append(names, name)
	if len(names) > max {
		names = names[len(names)-max:]
	}
	return names
}

// matomezuHookCommand は、matomezu のプラグインのフックのコマンドの頭（hooks/hooks.json）
const matomezuHookCommand = "matomezu claude-code hook "

// attachmentChars は、Claude Code が会話に添えた物 raw（type attachment の行の attachment）の字数と、そのうち matomezu の分。
// matomezu の分は、matomezu のフックの出力（文で出した物は hook_success に command が残る。JSON の additionalContext・systemMessage は
// hook_additional_context・hook_system_message になり command が無いので、中身で見分ける。matomezuHookText）と、ターンの途中で届いた起こす知らせ（queued_command）
func attachmentChars(raw json.RawMessage) (total, matomezu int64) {
	var a struct {
		Type    string          `json:"type"`
		Command string          `json:"command"`
		Content json.RawMessage `json:"content"`
		Prompt  string          `json:"prompt"`
	}
	if json.Unmarshal(raw, &a) != nil {
		return 0, 0
	}
	total = textChars(raw, attachmentMeta)
	switch a.Type {
	case "hook_success":
		if strings.HasPrefix(a.Command, matomezuHookCommand) {
			matomezu = total
		}
	case "hook_additional_context", "hook_system_message":
		if matomezuHookText(firstText(a.Content)) {
			matomezu = total
		}
	case "queued_command":
		matomezu = wakeNoticeChars(a.Prompt)
	}
	return total, min(matomezu, total)
}

// firstText は、添えた物の content（文か、文の並び）の最初の文
func firstText(raw json.RawMessage) string {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text
	}
	var texts []string
	if json.Unmarshal(raw, &texts) == nil && len(texts) > 0 {
		return texts[0]
	}
	return ""
}

// matomezuHookTexts は、matomezu の話しかけのフック（talked）が additionalContext と systemMessage に書く文の頭。
// 参加しました（英語の forAi と、利用者に見せる文）・待つアノテーションなどの知らせ（matomezu: で始まる）・裏の知らせで始まったターン・前の会話から移した参加者
var matomezuHookTexts = []string{
	"matomezu",
	"You joined matomezu",
	"This turn was started by a matomezu notice",
	"This conversation continues an earlier one it replaced, and matomezu",
}

// matomezuHookText は、フックが会話に足した文 text が matomezu のフックの物か。フックの JSON の出力の記録にはコマンドが無いので、文の頭で見分ける（ほかのフックが同じ頭で書けば紛れる）
func matomezuHookText(text string) bool {
	text = strings.TrimSpace(text)
	for _, head := range matomezuHookTexts {
		if strings.HasPrefix(text, head) {
			return true
		}
	}
	return false
}

// MonitorDescription は、matomezu のプラグインの monitor の説明（monitors/monitors.json の description）
const MonitorDescription = "What the user did on the matomezu screen for you"

// taskNotification は、Claude Code が monitor の 1 行などをターンの入力に入れるときの包み
const taskNotification = "<task-notification>"

// wakeNoticeChars は、ターンの入力 text のうち、matomezu の起こす知らせの字数。Claude Code は monitor の 1 行を <task-notification> で包み、
// <summary>Monitor event: "<monitor の説明>"</summary> を付ける（手すきなら利用者の行、ターンの途中なら queued_command の添えた物になる）。包みが幾つか並ぶこともある
func wakeNoticeChars(text string) int64 {
	if !strings.Contains(text, taskNotification) {
		return 0
	}
	summary := `<summary>Monitor event: "` + MonitorDescription + `"</summary>`
	var n int64
	for _, part := range strings.Split(text, taskNotification) {
		if strings.Contains(part, summary) {
			n += runes(taskNotification + part)
		}
	}
	return n
}

// textChars は、JSON raw の文字列の値の字数の合計（meta の名前の項目は数えない）
func textChars(raw json.RawMessage, meta map[string]bool) int64 {
	if len(raw) == 0 {
		return 0
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return 0
	}
	return valueChars(v, meta)
}

func valueChars(v any, meta map[string]bool) int64 {
	switch v := v.(type) {
	case string:
		return runes(v)
	case []any:
		var n int64
		for _, e := range v {
			n += valueChars(e, meta)
		}
		return n
	case map[string]any:
		var n int64
		for k, e := range v {
			if !meta[k] {
				n += valueChars(e, meta)
			}
		}
		return n
	}
	return 0
}

func runes(s string) int64 { return int64(utf8.RuneCountInString(s)) }
