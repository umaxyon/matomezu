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
	"slices"
	"sync"
	"time"

	"github.com/dop251/goja"
	"github.com/umaxyon/matomezu/internal/plugin"
)

//go:embed engine.js
var source string

// BulkAction は、アクションバルクの中のアクション 1 つ。IDs は振る id のもと（画面で先に行ったときの値。尽きたら新しく作る）
type BulkAction struct {
	Action string          `json:"action"`
	Args   json.RawMessage `json:"args"`
	On     *On             `json:"on,omitempty"`
	Lang   string          `json:"lang,omitempty"` // 画面で先に行ったときの言語（空ならエンジンが設定の言語の項目で決める）
	IDs    []string        `json:"ids,omitempty"`
	Now    string          `json:"now,omitempty"` // 画面で先に行った時点（無ければエンジンが決める）
}

// Input はアクションバルク 1 つの頼み。Actions を順に行い、全部通るか全部断る
type Input struct {
	Actions []BulkAction `json:"actions"`
	// Pages と Folders は、アクションの全部が要るブックのページとフォルダ（置き場所から読んだまま。アクションごとの、宛先のブックか、レコードが対象なら RecordNeeds の Books の和。
	// 宛先がブックに入っていないページなら、そのページの行か、それを持つバインダの行と中のページの行。
	// 一覧のアクションか、宛先が置き場所に無いアクションを含むなら、全部のブックと、ブックに入っていないページとバインダの全部）。
	// Folders には、ブックとバインダの行の後ろに、それらから書庫の一番上（書庫ホームか、ゴミ箱の中のブックならゴミ箱）までの、書庫ホーム・ゴミ箱・フォルダの行
	// （ブックごとに近い順。全部のときは、書庫ホーム・ゴミ箱と、ほかのフォルダの全部を id の順に）も入る
	Pages    []json.RawMessage `json:"pages"`
	Folders  []json.RawMessage `json:"folders"`
	Settings json.RawMessage   `json:"settings"`
	// Annotations は Pages のページのアノテーション（ページの id → 並び。アノテーションの有るページの分）
	Annotations map[string]json.RawMessage `json:"annotations,omitempty"`
	// Records は対象の定義が足した種類のレコード（種類の id → id → レコード。アクションごとの宛先のレコードの和）。Counters は対象の種類の、区切り → 次の番号（アクションごとの対象の種類の和）
	Records  map[string]map[string]json.RawMessage `json:"records,omitempty"`
	Counters map[string]map[string]int64           `json:"counters,omitempty"`
	// Actor は頼んだ者（無ければ利用者）。AI は入っているワークルームの id を Workroom に持つ（空なら参加が確定していない）
	Actor *Actor `json:"actor,omitempty"`
	// TimeoutSec は、アクションを待つ秒数（0 なら DefaultTimeoutSec。MaxTimeoutSec まで）。超えたら打ち切って断る
	TimeoutSec int `json:"-"`
	// Watched は、利用者が直している物（ブックの id → 物の id。編集ロック）。AI のアクションと lockedForUser のアクションが変えるか消すなら、エンジンが being-edited で断る
	Watched map[string][]string `json:"watched,omitempty"`
	// WatchedRecords は、利用者が直しているレコード（対象の種類の id → レコードの id）。レコードが対象のアクションにも同じ決まりで効く
	WatchedRecords map[string][]string `json:"watchedRecords,omitempty"`
}

// Actor は頼んだ者。Kind は "user" か "ai"、Workroom は AI が入っているワークルームの id（空なら確定していない）
type Actor struct {
	Kind     string `json:"kind"`
	Workroom string `json:"workroom,omitempty"`
}

// On はアクションの宛先: ブックか、ページか、レコード（対象の定義が足した種類のデータ）のどれか
type On struct {
	Book   string `json:"book,omitempty"`
	Page   string `json:"page,omitempty"`
	Record string `json:"record,omitempty"`
}

// RecordChange は、アクションが変えたレコード 1 件。Record は新しいレコードか、消したなら "removed"（JSON の文字）
type RecordChange struct {
	Subject string          `json:"subject"`
	ID      string          `json:"id"`
	Record  json.RawMessage `json:"record"`
	Keys    map[string]any  `json:"keys,omitempty"`   // 索引キーの値（名前 → 文字か数。索引キーの無い種類と、消したレコードには無い）
	Search  *SearchText     `json:"search,omitempty"` // 横断検索に使う文字（searchTexts を持つ種類だけ。消したレコードには無い）
}

// SearchText は、レコード 1 件の、横断検索に使う文字（題と本文。どちらも空でありうる）
type SearchText struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// KeySpec は索引キー 1 つの宣言（名前と、値の型 text か number）、Kind はレコードの種類 1 つとその索引キーの宣言
type KeySpec struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type Kind struct {
	Subject string    `json:"subject"`
	Keys    []KeySpec `json:"keys"`
	Search  bool      `json:"search"`           // 横断検索できる種類か（searchTexts を書いた種類）
	AI      bool      `json:"ai"`               // AI に見せる種類か（read_records）
	AIList  *AIList   `json:"aiList,omitempty"` // 一覧の既定の並びと件数（索引キーで探す種類だけ）
	// 一覧の既定の目次に載せない物がある種類の、載せない物の説明（read_records の unlisted を受ける種類）
	AIUnlisted string `json:"aiUnlisted,omitempty"`
}

// AIList は、AI に見せる一覧の既定の並び（索引キー Key の asc か desc）と件数
type AIList struct {
	Order struct {
		Key string `json:"key"`
		Dir string `json:"dir"`
	} `json:"order"`
	Limit int `json:"limit"`
}

// RecordNeeds は、アクションが対象にする種類（レコードが対象でなければ空）と、読むだけのブックの id（アクションが引数から答える）
type RecordNeeds struct {
	Subject string   `json:"subject"`
	Books   []string `json:"books"`
}

// Output はアクションバルクを行った結果。断ったときは OK が false で Reason に理由、Detail に AI への説明（認可ステップが止めた denied なら、Permission にそのステップの id）、
// At に断られたアクションが何番目か（0 から）。変えた物は、アクションの全部を重ねた後の物（同じページ・フォルダ・レコードは 1 つ）。
// Books は変わった・足したブック、Removed は一覧から無くなったブック、Settings は変わった設定（変わらなければ空）、
// Annotations はアノテーションが変わったページの id → 新しい並び（空の並びなら全部無くなった）
type Output struct {
	OK            bool                        `json:"ok"`
	Reason        string                      `json:"reason,omitempty"`
	Permission    string                      `json:"permission,omitempty"`
	Detail        string                      `json:"detail,omitempty"`
	Page          string                      `json:"page,omitempty"`     // 読めないページで断ったとき（reason unreadable）、そのページの id
	Code          string                      `json:"code,omitempty"`     // 読めないページで断ったとき、読めない理由の warning の番号（W027〜W029）
	At            *int                        `json:"at,omitempty"`       // 断られたアクションが何番目か（常駐のログにだけ使う）
	Result        json.RawMessage             `json:"result,omitempty"`   // 最後のアクションの結果
	Pages         []RowChange                 `json:"pages,omitempty"`    // 変わった・足した・無くなったページ
	Folders       []RowChange                 `json:"folders,omitempty"`  // 変わった・足した・無くなったフォルダ
	Created       []string                    `json:"created,omitempty"`  // そのうち新しく足したページ・フォルダの id（世界のどこにも無い id であること）
	Books         []string                    `json:"books,omitempty"`    // 変わったブックの id（変わったページ・フォルダを持つブック。無くなったブックも）
	Trashing      []string                    `json:"trashing,omitempty"` // 新しくゴミ箱に入るブックの id
	Settings      json.RawMessage             `json:"settings,omitempty"`
	Annotations   map[string]json.RawMessage  `json:"annotations,omitempty"`
	Records       []RecordChange              `json:"records,omitempty"`       // 変わったレコードの全部（宛先が先）。1 つのトランザクションで書く
	Counters      map[string]map[string]int64 `json:"counters,omitempty"`      // 番号を進めた種類の id → 区切り → 次の番号（進めた区切りだけ）
	Notice        string                      `json:"notice,omitempty"`        // AI への知らせ（可変ページの中身をずらして位置が変わったなど）
	AIEditTickets []AIEditTicketChange        `json:"aiEditTickets,omitempty"` // レコードが対象のアクションが返した、AI 編集チケットの変え方の並び（レコードと同じ 1 回の書き込みで、順に当てる）
	AIMessages    []AIMessage                 `json:"aiMessages,omitempty"`    // レコードが対象のアクションが返した、送る AI 間メッセージ（行ったのは参加の確定した AI。常駐が書き込みと一緒に送る）
}

// AIMessage は、アクションが送る AI 間メッセージ 1 通（Workroom は宛先のワークルームの id。送り手は行った参加者）
type AIMessage struct {
	Workroom string `json:"workroom"`
	Text     string `json:"text"`
}

// RowChange は、変わったページ・フォルダ 1 つ（Row は新しい本文。無くなったなら Removed）
type RowChange struct {
	ID      string          `json:"id"`
	Row     json.RawMessage `json:"row,omitempty"`
	Removed bool            `json:"removed,omitempty"`
}

// AIEditTicketChange は、アクションが返した AI 編集チケットの変え方。Subject はそれを返したアクションの対象の種類で、Key でその種類の中の 1 つを見分け（郵便の id など）、ブック Book の AI 編集チケットを
// 作る（open）・閉じる（closed）・失敗にする（failed。Changed は変わった・無くなった物の id）・郵便が消えたと記す（removed。
// Cause は消えたわけで、上限で消えた limit か、利用者が消した user）
type AIEditTicketChange struct {
	Subject string   `json:"subject"`
	Book    string   `json:"book"`
	Key     string   `json:"key"`
	Outcome string   `json:"outcome"`
	Changed []string `json:"changed,omitempty"`
	Cause   string   `json:"cause,omitempty"`
}

// Engine は読み込んだホストのエンジン（engine.js）
type Engine struct {
	mu          sync.Mutex
	vm          *goja.Runtime
	source      Source // 行っている間だけある、レコードを引く口（PerformWith）
	kinds       func() string
	aiRows      func(string, string) string
	keysOf      func(string, string) string
	searchOf    func(string, string) string
	parentsOf   func(string, string) string
	unlisted    func(string, string) string
	perform     func(string) string
	readAI      func() string
	check       func(string) string
	checkTree   func(string, string) string
	lines       func(string) string
	settings    func(string) string
	notes       func(string) string
	without     func(string, string) string
	talk        func() string
	join        func() string
	end         func() string
	alive       func(string, string, float64) bool
	needs       func(string, string) string
	roles       func() string
	aiRecords   func(string, string, string, string) string
	once        func() string
	records     func(string) string
	joinedMsg   func(string, string) string
	live        func(string, string, string, string) string
	forAI       func(string) string
	briefs      func(string) string
	placed      func(string) string
	aiPage      func(string, string) string
	item        func(string, string) string
	use         goja.Callable
	disabledFor goja.Callable
	disabled    []string
	aiCatalog   json.RawMessage
	modules     plugin.Modules
	warnings    []string
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
	// engine.js が行っている間にレコードを引く口（行っていない間と、口を渡されていないときは、何も無いと答える）
	if err := vm.Set("matomezuHostRecord", func(subject, id string) string {
		if e.source == nil {
			return ""
		}
		body, ok := e.source.Record(subject, id)
		if !ok {
			return ""
		}
		return string(body)
	}); err != nil {
		return nil, err
	}
	if err := vm.Set("matomezuHostFind", func(subject, where string, keysOnly bool) string {
		if e.source == nil {
			return "{}"
		}
		b, err := json.Marshal(e.source.Find(subject, json.RawMessage(where), keysOnly))
		if err != nil {
			return "{}"
		}
		return string(b)
	}); err != nil {
		return nil, err
	}
	if err := vm.ExportTo(vm.Get("matomezuKinds"), &e.kinds); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuKinds: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiRows"), &e.aiRows); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiRows: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuKeysOf"), &e.keysOf); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuKeysOf: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuSearchTextsOf"), &e.searchOf); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuSearchTextsOf: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuParentsOf"), &e.parentsOf); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuParentsOf: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuUnlistedOf"), &e.unlisted); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuUnlistedOf: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuPerform"), &e.perform); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuPerform: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiCatalog"), &e.readAI); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiCatalog: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuCheckBooks"), &e.check); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCheckBooks: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuCheckLibrary"), &e.checkTree); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCheckLibrary: %w", err)
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
	if err := vm.ExportTo(vm.Get("matomezuEndActions"), &e.end); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuEndActions: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuParticipantAlive"), &e.alive); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuParticipantAlive: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuCheckRecords"), &e.records); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCheckRecords: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuRunOnceActions"), &e.once); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuRunOnceActions: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuSubjectRoles"), &e.roles); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuSubjectRoles: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuAiRecords"), &e.aiRecords); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuAiRecords: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuRecordNeeds"), &e.needs); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuRecordNeeds: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuJoinedText"), &e.joinedMsg); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuJoinedText: %w", err)
	}
	if err := vm.ExportTo(vm.Get("matomezuUnexpired"), &e.live); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuUnexpired: %w", err)
	}
	use, ok := goja.AssertFunction(vm.Get("matomezuUse"))
	if !ok {
		return nil, fmt.Errorf("engine.js has no matomezuUse")
	}
	e.use = use
	disabledFor, ok := goja.AssertFunction(vm.Get("matomezuDisabledPlugins"))
	if !ok {
		return nil, fmt.Errorf("engine.js has no matomezuDisabledPlugins")
	}
	e.disabledFor = disabledFor
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

// UseFor は追加プラグインを動かして受け取り、ビルトインプラグインに足して組み直す。返すのはプラグインの id（bundles の順）。
// settings（利用者の設定の JSON）を渡すと、利用者が有効にしていない追加プラグインは、名乗りと文言だけで組む（無効のプラグイン。Disabled が id を返す）。nil なら全部有効。
// 動かせない・default でプラグインを出していない・manifest と id が違う・台帳アセンブルで食い違うなら error で、前の組のまま
func (e *Engine) UseFor(bundles []*plugin.Bundle, settings json.RawMessage) (ids []string, err error) {
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
	args := []goja.Value{e.vm.NewArray(plugins...)}
	if settings != nil {
		args = append(args, e.vm.ToValue(string(settings)))
	}
	res, err := e.use(goja.Undefined(), args...)
	if err != nil {
		return nil, fmt.Errorf("plugins: %w", err)
	}
	var used struct {
		Warnings []string        `json:"warnings"`
		AI       json.RawMessage `json:"ai"`
		Disabled []string        `json:"disabled"`
	}
	if err := json.Unmarshal([]byte(res.String()), &used); err != nil {
		return nil, fmt.Errorf("plugins: %w", err)
	}
	e.warnings = used.Warnings
	e.aiCatalog = used.AI
	e.disabled = used.Disabled
	return ids, nil
}

// Disabled は、最後に組み直したときに無効で組んだ追加プラグインの id
func (e *Engine) Disabled() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return slices.Clone(e.disabled)
}

// DisabledFor は、設定 settings（JSON）のとき、今足している追加プラグインのうち無効になる物の id（組み直すかを決めるのに使う）
func (e *Engine) DisabledFor(settings json.RawMessage) (ids []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	res, err := e.disabledFor(goja.Undefined(), e.vm.ToValue(string(settings)))
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(res.String()), &ids); err != nil {
		return nil, err
	}
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
func (e *Engine) Perform(in Input) (out Output, err error) { return e.PerformWith(in, nil) }

// Source は、アクションを行っている間にエンジンがレコードを引く口: 種類 subject の id の 1 件（無ければ false）と、
// 索引キーの条件 where（engine.js が渡す JSON の並び）に合うかもしれないレコード（id → 見つかった物。合わない物が混ざってよく、絞るのはエンジン）。
// 読む物を関数で宣言したアクションと、レコードが指す先・同じ種類のほかのレコードを引くのに使う
type Source interface {
	Record(subject, id string) (json.RawMessage, bool)
	Find(subject string, where json.RawMessage, keysOnly bool) map[string]SourceFound
}

// SourceFound は Source が探して見つけたレコード 1 件: 中身（keysOnly なら無い）と、置き場所が持っている索引キーの値
type SourceFound struct {
	Record json.RawMessage `json:"record,omitempty"`
	Keys   map[string]any  `json:"keys"`
}

// Kinds は、今の機能台帳のレコードの種類と、索引キーの宣言
func (e *Engine) Kinds() (kinds []Kind, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.kinds()), &kinds)
	return kinds, err
}

// AIRows は、AI に見せる種類 kind のレコードの並び records の、一覧の行（受けた順のまま。id・種類が添えるフィールド・題 brief）。AI に見せない種類なら ok が false。
// 題が引く指す先のレコードは src から引く（呼ぶ側が置き場所を止めておく）
func (e *Engine) AIRows(kind string, records []json.RawMessage, src Source) (rows []json.RawMessage, ok bool, err error) {
	b, err := json.Marshal(records)
	if err != nil {
		return nil, false, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	out := e.aiRows(kind, string(b))
	if out == "null" {
		return nil, false, nil
	}
	err = json.Unmarshal([]byte(out), &rows)
	return rows, err == nil, err
}

// KeysOf は、種類 subject のレコード records（id → レコード）の索引キーの値（id → 名前 → 値）
func (e *Engine) KeysOf(subject string, records map[string]json.RawMessage) (keys map[string]map[string]any, err error) {
	b, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.keysOf(subject, string(b))), &keys)
	return keys, err
}

// SearchTextsOf は、種類 subject のレコード records（id → レコード）の、横断検索に使う文字（id → 題と本文）。形に合わないレコードは含めない
func (e *Engine) SearchTextsOf(subject string, records map[string]json.RawMessage) (texts map[string]SearchText, err error) {
	b, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.searchOf(subject, string(b))), &texts)
	return texts, err
}

// Ref は、レコード 1 件の指す先（種類の id と id）
type Ref struct {
	Kind string `json:"subject"`
	ID   string `json:"id"`
}

// ParentsOf は、種類 subject のレコード records（id → レコード）の親（定義の refers の先頭 1 件。id → 指す先）。refers を書かない種類や、指す先の無いレコードは含めない
func (e *Engine) ParentsOf(subject string, records map[string]json.RawMessage) (parents map[string]Ref, err error) {
	b, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.parentsOf(subject, string(b))), &parents)
	return parents, err
}

// UnlistedOf は、種類 subject のレコード records（id → レコード）のうち、一覧の既定の目次に載せない物の id（aiListed を書かない種類は、載せない物が無い）。
// 指す先のレコードは src から引く（呼ぶ側が置き場所を止めておく）
func (e *Engine) UnlistedOf(subject string, records map[string]json.RawMessage, src Source) (ids []string, err error) {
	b, err := json.Marshal(records)
	if err != nil {
		return nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.unlisted(subject, string(b))), &ids)
	return ids, err
}

// PerformWith は、レコードを引く口 src を渡して Perform する（src が nil なら、in の Records だけで行う）
func (e *Engine) PerformWith(in Input, src Source) (out Output, err error) {
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
	e.source = src
	defer func() { e.source = nil }()
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

// BookWarning は warning のあるブック: ブックの id・warning の番号・warning の 1 行と、ブックごと読めないか（エンジンが決める。
// ブックごと読めない W005 形に合わない・W006 決まりを守らない、読めるが機能台帳に無い物を持つ W007 など）。
// 読めるブックの読めないページ（W027 タイプが無い・W028 タイプの形に合わない・W029 タイプの決まりを守らない）の warning は、ページ 1 枚に 1 つで、Page にそのページの id
type BookWarning struct {
	Book       string `json:"book"`
	Code       string `json:"code"`
	Warning    string `json:"warning"`
	Unreadable bool   `json:"unreadable"`
	Page       string `json:"page,omitempty"`
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

// CheckLibrary は、フォルダの行の全部（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）とページの行の id の全部 pages が木の決まりを守るかを確かめ、破れていれば warning（W030）の 1 行を、守っていれば空の文字列を返す
// （データには手を付けない）
func (e *Engine) CheckLibrary(folders []json.RawMessage, pages []string) (line string, err error) {
	b, err := json.Marshal(folders)
	if err != nil {
		return "", err
	}
	// ページが 1 枚も無いときも、空の並びとして渡す（nil のままだと JSON の null になる）
	ids, err := json.Marshal(append([]string{}, pages...))
	if err != nil {
		return "", err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	return e.checkTree(string(b), string(ids)), nil
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

// CheckRecords はレコード（種類の id → id → レコード）を今の機能台帳で確かめ、効かないレコード（種類が無い・形が合わない）の warning の 1 行ずつを返す（データには手を付けない）
func (e *Engine) CheckRecords(records map[string]map[string]json.RawMessage) (out []string, err error) {
	body, err := json.Marshal(records)
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
	err = json.Unmarshal([]byte(e.records(string(body))), &out)
	return out, err
}

// TalkActions は、利用者トリガートークのときに、アノテーションのあるブックごとに行うアクションの id
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

// EndActions は、参加者のセッションが終わったときに常駐が行うアクションの id（参加者を外す Leave）
type EndActions struct {
	Leave string `json:"leave"`
}

// EndActions は、参加者のセッションが終わったときに常駐が行うアクション。アクションの定義が役を名乗る（Go はアクションの id を知らない）。無ければ nil
func (e *Engine) EndActions() (ids *EndActions, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.end()), &ids)
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

// RunOnceActions は、常駐が初めて起動したときに 1 度だけ行うアクション（runsOnceAtStart）の id の並び
func (e *Engine) RunOnceActions() (ids []string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.once()), &ids)
	return ids, err
}

// SubjectRoles は、常駐が読む種類の役（participants・workrooms）ごとの、対象の定義の id（役を名乗る定義が無ければ入らない）
func (e *Engine) SubjectRoles() (roles map[string]string, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.roles()), &roles)
	return roles, err
}

// RecordBrief は、AI に見せるレコードの一覧の 1 行
type RecordBrief struct {
	ID    string `json:"id"`
	Brief string `json:"brief"`
}

// AIRecords は、AI に見せる種類 kind のレコードの一覧（トップの項目が where の値と同じ物のうち、unlisted の hide は目次に載せる物だけ・include は全部・only は載せない物だけ。
// 種類が決めた並び）と、hide のときの載せなかった数を返す。指す先のレコードは src から引く（呼ぶ側が置き場所を止めておく）。AI に見せない種類・無い種類は ok が false
func (e *Engine) AIRecords(kind string, records []json.RawMessage, where map[string]string, unlisted string, src Source) (rows []RecordBrief, hidden int, ok bool, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.source = src
	defer func() { e.source = nil }()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	in, err := json.Marshal(records)
	if err != nil {
		return nil, 0, false, err
	}
	w, err := json.Marshal(where)
	if err != nil {
		return nil, 0, false, err
	}
	out := e.aiRecords(kind, string(in), string(w), unlisted)
	if out == "null" {
		return nil, 0, false, nil
	}
	var listed struct {
		Rows     []RecordBrief `json:"rows"`
		Unlisted int           `json:"unlisted"`
	}
	err = json.Unmarshal([]byte(out), &listed)
	return listed.Rows, listed.Unlisted, err == nil, err
}

// RecordNeeds は、アクション action が対象にする種類（レコードが対象でなければ Subject が空）と、読むだけの種類と、
// 引数 args（perform の args の JSON。無ければ空）から答えた読むだけのブックの id を返す
func (e *Engine) RecordNeeds(action string, args json.RawMessage) (needs RecordNeeds, err error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	err = json.Unmarshal([]byte(e.needs(action, string(args))), &needs)
	return needs, err
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

// AIAnnotations は、ブックとそのページごとのアノテーションの組ごとに、AI に見せる並び（アノテーションに、付いているページ page と、
// AI の応えを待っているか awaits を添えたもの。ブックのページの順）を返す。並びは pairs と同じ順
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

// AIBriefs は、ブックとそのページごとのアノテーションの組ごとに、待っている物を AI に知らせる 1 行（ページの id → アノテーションの id → 1 行。
// 種類が 1 行を持たない物・形の合わない物は入れない）を返す。並びは pairs と同じ順
func (e *Engine) AIBriefs(pairs []AnnotatedBook) (out []map[string]map[string]string, err error) {
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

// AIPlaced は、ブックのページの id ごとの、形の描いた位置と大きさ（{id, x, y, w, h} の並び。紙の上の左上から）を返す。
// プレゼンテーションが答えないブック・読めないブックなら null（JSON の null）
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

// AnnotatedBook はブックと、そのページごとのアノテーション（ページの id → 並び。CheckAnnotations・AIAnnotations・AIBriefs に渡す）
type AnnotatedBook struct {
	Book        json.RawMessage            `json:"book"`
	Annotations map[string]json.RawMessage `json:"annotations"`
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
