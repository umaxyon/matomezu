// Package engine は、画面と同じアクションを、ホストのエンジン（engine.js）で常駐の中で行う。
//
// engine.js は web/src/engine/engine.ts をまとめたもの（bun run build:engine。作り直して差分が無いことはテストが見張る）。
// goja で動かす。goja の実行環境は同時に使えないので、1 つを鍵で守って順に使う。
// 追加プラグインは、変換した JS（internal/plugin）を同じ実行環境で動かして受け取り、ビルトインプラグインに足して組み直す（Use）。
package engine

import (
	"crypto/rand"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/dop251/goja"
	"github.com/umaxyon/matomezu/internal/plugin"
)

//go:embed engine.js
var source string

// Input はアクション 1 つの頼み。Books は対象のアクションが要るブック（一覧のアクションなら全部）、
// IDs は振る id のもと（画面で先に行ったときの値。尽きたら新しく作る）
type Input struct {
	Action   string            `json:"action"`
	Args     json.RawMessage   `json:"args"`
	On       *On               `json:"on,omitempty"`
	Lang     string            `json:"lang,omitempty"` // 画面で先に行ったときの言語（空ならエンジンが設定の言語の項目で決める）
	IDs      []string          `json:"ids,omitempty"`
	Now      string            `json:"now,omitempty"` // 画面で先に行った時点（無ければエンジンが決める）
	Books    []json.RawMessage `json:"books"`
	Settings json.RawMessage   `json:"settings"`
	// Annotations は要るブックのアノテーション（ブックの id → 並び。宛先のブックのか、一覧のアクションなら全部）
	Annotations  map[string]json.RawMessage `json:"annotations,omitempty"`
	Mailbox      json.RawMessage            `json:"mailbox,omitempty"`      // 利用者の郵便箱
	Participants json.RawMessage            `json:"participants,omitempty"` // 利用者の参加者の表
	By           string                     `json:"by,omitempty"`           // 頼んだのが AI なら "ai"（空なら利用者）
	// TimeoutSec は、アクションを待つ秒数（0 なら DefaultTimeoutSec。MaxTimeoutSec まで）。超えたら打ち切って断る
	TimeoutSec int `json:"-"`
	// Watched は、利用者が直している物（ブックの id → 物の id。編集ロック）。AI のアクションと lockedForUser のアクションが変えるか消すなら、エンジンが being-edited で断る
	Watched map[string][]string `json:"watched,omitempty"`
}

// On はアクションの宛先のブック
type On struct {
	Book string `json:"book"`
}

// Output は行った結果。断ったときは OK が false で Reason に理由、Detail に AI への説明（認可ステップが止めた denied なら、Permission にそのステップの id）。
// Books は変わった・足したブック、Removed は一覧から無くなったブック、Settings は変わった設定（変わらなければ空）、
// Annotations はアノテーションが変わったブックの id → 新しい並び（空の並びなら全部無くなった）
type Output struct {
	OK           bool                       `json:"ok"`
	Reason       string                     `json:"reason,omitempty"`
	Permission   string                     `json:"permission,omitempty"`
	Detail       string                     `json:"detail,omitempty"`
	Result       json.RawMessage            `json:"result,omitempty"`
	Books        []json.RawMessage          `json:"books,omitempty"`
	Removed      []string                   `json:"removed,omitempty"`
	Settings     json.RawMessage            `json:"settings,omitempty"`
	Annotations  map[string]json.RawMessage `json:"annotations,omitempty"`
	Mailbox      json.RawMessage            `json:"mailbox,omitempty"`      // 変わった郵便箱
	Participants json.RawMessage            `json:"participants,omitempty"` // 変わった参加者の表
	Notice       string                     `json:"notice,omitempty"`       // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
	AIEditTicket *AIEditTicketChange        `json:"aiEditTicket,omitempty"` // 郵便箱が対象のアクションが返した、AI 編集チケットの変え方
}

// AIEditTicketChange は、アクションが返した AI 編集チケットの変え方。Key で 1 つを見分け（郵便の id など）、ブック Book の AI 編集チケットを
// 作る（open）・閉じる（closed）・失敗にする（failed。Changed は変わった・無くなった物の id）
type AIEditTicketChange struct {
	Book    string   `json:"book"`
	Key     string   `json:"key"`
	Outcome string   `json:"outcome"`
	Changed []string `json:"changed,omitempty"`
}

// Engine は読み込んだホストのエンジン（engine.js）
type Engine struct {
	mu        sync.Mutex
	vm        *goja.Runtime
	perform   func(string) string
	readAI    func() string
	check     func(string) string
	lines     func(string) string
	settings  func(string) string
	notes     func(string) string
	without   func(string, string) string
	talk      func() string
	join      func() string
	projects  func() string
	alive     func(string, string, float64) bool
	joinedMsg func(string, string) string
	live      func(string, string, string, string) string
	mails     func(string) string
	forAI     func(string) string
	briefs    func(string) string
	aiMail    func(string) string
	placed    func(string) string
	aiPage    func(string, string) string
	item      func(string, string) string
	use       goja.Callable
	aiCatalog json.RawMessage
	modules   plugin.Modules
	warnings  []string
}

// New はホストのエンジン（engine.js）を読み込む
func New() (*Engine, error) {
	vm := goja.New()
	if err := vm.Set("crypto", map[string]any{"randomUUID": randomUUID}); err != nil {
		return nil, err
	}
	if _, err := vm.RunScript("engine.js", source); err != nil {
		return nil, fmt.Errorf("engine.js: %w", err)
	}
	e := &Engine{vm: vm}
	if err := vm.ExportTo(vm.Get("matomezuPerform"), &e.perform); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuPerform: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiCatalog"), &e.readAI); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiCatalog: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuCheckBooks"), &e.check); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCheckBooks: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuWarningLines"), &e.lines); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuWarningLines: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuReadSettings"), &e.settings); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuReadSettings: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuCheckAnnotations"), &e.notes); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCheckAnnotations: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAnnotationsWithout"), &e.without); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAnnotationsWithout: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiAnnotations"), &e.forAI); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiAnnotations: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiBriefs"), &e.briefs); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiBriefs: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiMail"), &e.aiMail); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiMail: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiPlaced"), &e.placed); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiPlaced: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiPage"), &e.aiPage); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiPage: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiItem"), &e.item); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiItem: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuTalkActions"), &e.talk); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuTalkActions: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuJoinActions"), &e.join); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuJoinActions: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuParticipantAlive"), &e.alive); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuParticipantAlive: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuJoinedText"), &e.joinedMsg); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuJoinedText: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuProjects"), &e.projects); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuProjects: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuUnexpired"), &e.live); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuUnexpired: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuCheckMailbox"), &e.mails); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCheckMailbox: %w", err)
	}
	use, ok := goja.AssertFunction(vm.Get("matomezuUse"))
	if !ok {
		return nil, fmt.Errorf("engine.js has no matomezuUse")
	}
	e.use = use
	var names func() string
	if err := vm.ExportTo(vm.Get("matomezuModuleNames"), &names); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuModuleNames: %w", err)
	}
	if err := json.Unmarshal([]byte(names()), &e.modules); err != nil {
		return nil, err
	}
	e.aiCatalog = json.RawMessage(e.readAI())
	return e, nil
}

// Modules は、追加プラグインが借りる名前（変換で取り込まない名前）
func (e *Engine) Modules() plugin.Modules {
	return e.modules
}

// Use は追加プラグインを動かして受け取り、ビルトインプラグインに足して組み直す。返すのはプラグインの id（bundles の順）。
// 動かせない・default でプラグインを出していない・manifest と id が違う・台帳アセンブルで食い違うなら error で、前の組のまま
func (e *Engine) Use(bundles []*plugin.Bundle) (ids []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	plugins := make([]any, 0, len(bundles))
	for _, b := range bundles {
		// CommonJS の JS を module の中で動かし、default で出したものを受け取る
		v, err := e.vm.RunScript(b.Dir, "(function(){var module={exports:{}};var exports=module.exports;\n"+b.Engine+"\n;return module.exports.default})()")
		if err != nil {
			return nil, fmt.Errorf("plugin %s: %w", b.Dir, err)
		}
		obj, ok := v.(*goja.Object)
		id := ""
		if ok {
			if got := obj.Get("id"); got != nil {
				id = got.String()
			}
		}
		if !ok || id == "" {
			return nil, fmt.Errorf("plugin %s: %s must export the plugin as default (export default definePlugin(...))", b.Dir, b.Manifest.Engine)
		}
		if id != b.Manifest.ID {
			return nil, fmt.Errorf("plugin %s: the id in %s is %q, but %s exports %q", b.Dir, plugin.ManifestFile, b.Manifest.ID, b.Manifest.Engine, id)
		}
		plugins = append(plugins, v)
		ids = append(ids, id)
	}
	// JS の側が、新しい組で MCP 公開ツールの actions が返す物まで作り終えてから入れ替える（途中で失敗すれば前の組のまま）
	res, err := e.use(goja.Undefined(), e.vm.NewArray(plugins...))
	if err != nil {
		return nil, fmt.Errorf("plugins: %w", err)
	}
	var used struct {
		Warnings []string        `json:"warnings"`
		AI       json.RawMessage `json:"ai"`
	}
	if err := json.Unmarshal([]byte(res.String()), &used); err != nil {
		return nil, fmt.Errorf("plugins: %w", err)
	}
	e.warnings = used.Warnings
	e.aiCatalog = used.AI
	return ids, nil
}

// Warnings は、最後に組み直したときの warning（止めるほどではない間違い。1 行ずつ）
func (e *Engine) Warnings() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.warnings
}

// DefaultTimeoutSec と MaxTimeoutSec は、アクションを待つ秒数の標準と上限。待つ間は Engine（と、その上の Hub）の鍵を持ったままなので、止まらない処理に全員が巻き込まれないよう上限を持つ
const (
	DefaultTimeoutSec = 5
	MaxTimeoutSec     = 60
)

// Perform はアクションを行う。in.TimeoutSec の間に終わらなければ、打ち切って断る（変更は反映しない）
func (e *Engine) Perform(in Input) (out Output, err error) {
	if in.TimeoutSec < 0 || in.TimeoutSec > MaxTimeoutSec {
		return Output{OK: false, Reason: "bad-args", Detail: fmt.Sprintf("timeoutSec must be 1 to %d", MaxTimeoutSec)}, nil
	}
	seconds := in.TimeoutSec
	if seconds == 0 {
		seconds = DefaultTimeoutSec
	}
	b, err := json.Marshal(in)
	if err != nil {
		return Output{}, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	timer := time.AfterFunc(time.Duration(seconds)*time.Second, func() { e.vm.Interrupt("timeout") })
	defer func() {
		timer.Stop()
		e.vm.ClearInterrupt()
	}()
	defer func() {
		if r := recover(); r != nil {
			var stopped *goja.InterruptedError
			if re, ok := r.(error); ok && errors.As(re, &stopped) {
				out, err = Output{OK: false, Reason: "refused", Detail: fmt.Sprintf("timed out after %d seconds; nothing was changed (timeoutSec up to %d lets a heavy action take longer)", seconds, MaxTimeoutSec)}, nil
				return
			}
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.perform(string(b))), &out); err != nil {
		return Output{}, err
	}
	return out, nil
}

// BookWarning は warning のあるブック: ブックの id・warning の番号・warning の 1 行と、読めないか（エンジンが決める。
// 読めない W004 タイプが無い・W005 形に合わない・W006 決まりを守らない、読めるが機能台帳に無い物を持つ W007 など）
type BookWarning struct {
	Book       string `json:"book"`
	Code       string `json:"code"`
	Warning    string `json:"warning"`
	Unreadable bool   `json:"unreadable"`
}

// CheckBooks はブックを今の機能台帳で確かめ、warning のあるものを返す（データには手を付けない）
func (e *Engine) CheckBooks(books []json.RawMessage) (out []BookWarning, err error) {
	b, err := json.Marshal(books)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.check(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CheckAnnotations はブックのアノテーションを今の機能台帳で確かめ、効かないもの（種類が無い・形が合わない）の warning の 1 行ずつを返す（データには手を付けない）。
// pairs はブックとそのアノテーションの並び
func (e *Engine) CheckAnnotations(pairs []AnnotatedBook) (out []string, err error) {
	b, err := json.Marshal(pairs)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.notes(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AnnotationsWithout は、アノテーションの並び list から、プラグイン plugin が足した種類のアノテーションを除いた並びと、除いたかを返す
func (e *Engine) AnnotationsWithout(plugin string, list json.RawMessage) (out json.RawMessage, changed bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Annotations json.RawMessage `json:"annotations"`
		Changed     bool            `json:"changed"`
	}
	if err := json.Unmarshal([]byte(e.without(plugin, string(list))), &got); err != nil {
		return nil, false, err
	}
	return got.Annotations, got.Changed, nil
}

// CheckMailbox は郵便箱 list を今の機能台帳で確かめ、効かない郵便（種類が無い・形が合わない）の warning の 1 行ずつを返す（データには手を付けない）
func (e *Engine) CheckMailbox(list json.RawMessage) (out []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.mails(string(list))), &out)
	return out, err
}

// TalkActions は、利用者が AI に話しかけたときに、アノテーションのあるブックごとに行うアクションの id
func (e *Engine) TalkActions() (ids []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.talk()), &ids)
	return ids, err
}

// JoinActions は、AI が参加を頼むときに行うアクションの id（参加者を作る Participant と、利用者に知らせる Notice）
type JoinActions struct {
	Participant string `json:"participant"`
	Notice      string `json:"notice"`
}

// JoinActions は、AI が参加を頼むときに行うアクション。アクションの定義が役を名乗る（Go はアクションの id を知らない）
func (e *Engine) JoinActions() (ids *JoinActions, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.join()), &ids)
	return ids, err
}

// JoinedText は、参加を利用者に伝える文（利用者の設定 settings の言語）
func (e *Engine) JoinedText(settings json.RawMessage, workroom string) (text string, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.joinedMsg(string(settings), workroom), nil
}

// ParticipantAlive は、参加者が時点 now で生きているか（最後に呼ばれた時刻 calledAt は RFC 3339 の文字。空なら呼ばれていない。利用者の設定 settings の参加の有効時間で決まる）
func (e *Engine) ParticipantAlive(settings json.RawMessage, calledAt string, now time.Time) (alive bool, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.alive(string(settings), calledAt, float64(now.UnixMilli())), nil
}

// Project はプロジェクトの表の 1 行
type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Projects はプロジェクトの表（core/project.ts。組み直しても変わらない）
func (e *Engine) Projects() (projects []Project, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.projects()), &projects)
	return projects, err
}

// AnnotationsUnexpired は、アノテーションの並び list から、期限（種類の expiresAt。利用者の設定 settings で決まる）が時点 now より前の物を除いた並びと、
// 除いたかを返す。kept の id の物は除かない（利用者が直している物）
func (e *Engine) AnnotationsUnexpired(list, settings json.RawMessage, now string, kept []string) (out json.RawMessage, changed bool, err error) {
	if kept == nil {
		kept = []string{}
	}
	k, err := json.Marshal(kept)
	if err != nil {
		return nil, false, err
	}
	if len(settings) == 0 {
		settings = json.RawMessage("{}")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Annotations json.RawMessage `json:"annotations"`
		Changed     bool            `json:"changed"`
	}
	if err := json.Unmarshal([]byte(e.live(string(list), string(settings), now, string(k))), &got); err != nil {
		return nil, false, err
	}
	return got.Annotations, got.Changed, nil
}

// AIAnnotations は、ブックとそのアノテーションの並びごとに、AI に見せる並び（アノテーションに、結び付く物の最後のあるページ page と、
// AI の応えを待っているか awaits を添えたもの）を返す。並びは pairs と同じ順
func (e *Engine) AIAnnotations(pairs []AnnotatedBook) (out []json.RawMessage, err error) {
	b, err := json.Marshal(pairs)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.forAI(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AIBriefs は、ブックとそのアノテーションの並びごとに、待っている物を AI に知らせる 1 行（アノテーションの id → 1 行。
// 種類が 1 行を持たない物・形の合わない物は入れない）を返す。並びは pairs と同じ順
func (e *Engine) AIBriefs(pairs []AnnotatedBook) (out []map[string]string, err error) {
	b, err := json.Marshal(pairs)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.briefs(string(b))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// MailQuery は、AI が郵便を読むときの取り方（read_mail の引数。値は外から来た文字のまま。エンジンの core（core/mail.ts の mailForAi）が確かめる）。Ids が nil なら一覧
type MailQuery struct {
	Ids       []string `json:"ids,omitempty"`
	Limit     *string  `json:"limit,omitempty"`
	Before    *string  `json:"before,omitempty"`
	Unseen    *string  `json:"unseen,omitempty"`
	Unvisited *string  `json:"unvisited,omitempty"`
}

// AIMail は、郵便箱（mailbox）を、プロジェクトの絞り projects と取り方 query で、AI に見せる形（一覧か、指した郵便の全文）にして返す。
// 取り方が合わなければ、answer は空で、断る理由 reason（AI に返す英語の文）を返す
func (e *Engine) AIMail(mailbox json.RawMessage, projects []string, query MailQuery) (answer json.RawMessage, reason string, err error) {
	b, err := json.Marshal(struct {
		Mailbox  json.RawMessage `json:"mailbox"`
		Projects []string        `json:"projects"`
		Query    MailQuery       `json:"query"`
	}{mailbox, projects, query})
	if err != nil {
		return nil, "", err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got struct {
		Ok     bool            `json:"ok"`
		Answer json.RawMessage `json:"answer"`
		Reason string          `json:"reason"`
	}
	if err := json.Unmarshal([]byte(e.aiMail(string(b))), &got); err != nil {
		return nil, "", err
	}
	if !got.Ok {
		return nil, got.Reason, nil
	}
	return got.Answer, "", nil
}

// AIPlaced は、ブックのページの id ごとの、形の描いた位置と大きさ（{id, x, y, w, h} の並び。紙の上の左上から）を返す。
// 見せ方が答えないブック・読めないブックなら null（JSON の null）
func (e *Engine) AIPlaced(book json.RawMessage) (out json.RawMessage, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return json.RawMessage(e.placed(string(book))), nil
}

// AIPage は、AI に見せるページ（read_page の page）を返す。背景を持つタイプのページは、背景の形（slide）の図形の情報を見せず、背景の文字だけを background に入れる。
// ほかのページと、読めないブックのページは、渡したまま返す
func (e *Engine) AIPage(book, page json.RawMessage) (out json.RawMessage, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return json.RawMessage(e.aiPage(string(book), string(page))), nil
}

// AnnotatedBook はブックとそのアノテーションの並び（CheckAnnotations・AIAnnotations に渡す）
type AnnotatedBook struct {
	Book        json.RawMessage `json:"book"`
	Annotations json.RawMessage `json:"annotations"`
}

// WarningLines は、窓が見つけて送ってきた warning（{code, plugin, params} の並び）を、warning の表の 1 行ずつにする。
// 表に無い番号・形の合わないものは捨てる（窓が作った文は使わない）
func (e *Engine) WarningLines(warnings json.RawMessage) (out []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.lines(string(warnings))), &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AISettings は AI が読む設定（MCP 公開ツールの read_settings）: 残した設定 settings から、利用者だけが変える項目と機能台帳に無い項目を除き、
// 値が無いか形に合わない項目は既定にしたもの（項目の id → 値）
func (e *Engine) AISettings(settings json.RawMessage) (out json.RawMessage, err error) {
	if len(settings) == 0 {
		settings = json.RawMessage("null")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return json.RawMessage(e.settings(string(settings))), nil
}

// AIItem は、ページ（JSON）の中の、どの深さの形も、つなぐものも、id で探した物（item）と、その物と子の形の id の全部（ids）。無ければ found が偽（core の探し方で探す）
func (e *Engine) AIItem(page json.RawMessage, id string) (item json.RawMessage, ids []string, found bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	var got *struct {
		Item json.RawMessage `json:"item"`
		IDs  []string        `json:"ids"`
	}
	if err := json.Unmarshal([]byte(e.item(string(page), id)), &got); err != nil {
		return nil, nil, false, err
	}
	if got == nil {
		return nil, nil, false, nil
	}
	return got.Item, got.IDs, true, nil
}

// randomUUID は版 4 の UUID（画面の crypto.randomUUID と同じ形）
func randomUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
