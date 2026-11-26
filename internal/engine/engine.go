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
	"fmt"
	"slices"
	"sync"

	"github.com/dop251/goja"
	"github.com/umaxyon/matomezu/internal/plugin"
)

//go:embed engine.js
var source string

// Engine は読み込んだホストのエンジン（engine.js）
type Engine struct {
	mu           sync.Mutex
	vm           *goja.Runtime
	source       Source // 行っている間だけある、レコードを引く口（PerformWith）
	kinds        func() string
	aiRows       func(string, string) string
	keysOf       func(string, string) string
	searchOf     func(string, string) string
	parentsOf    func(string, string) string
	unlisted     func(string, string) string
	perform      func(string) string
	readAI       func() string
	check        func(string) string
	checkOutside func(string) string
	checkTree    func(string, string) string
	lines        func(string) string
	settings     func(string) string
	notes        func(string) string
	without      func(string, string) string
	talk         func() string
	join         func() string
	end          func() string
	hosts        func() string
	alive        func(string, string, string, float64) bool
	lapsesAt     func(string, string) float64
	updateCheck  func(string) bool
	hostSettings func(string) string
	needs        func(string, string) string
	roles        func() string
	aiRecords    func(string, string, string, string) string
	recordBooks  func(string, string, string) string
	once         func() string
	sysFolders   func() string
	settle       func(string, string, string, string) string
	movedIfOff   func(string, string, string, string, string) string
	settleFail   func(string) string
	purge        func(string, string, string) string
	records      func(string) string
	joinedMsg    func(string, string) string
	visitorMsg   func(string) string
	workTitle    func(string, string, string) string
	workShift    func(string, string, string) string
	isAdmin      func(string) bool
	myWorkdesk   func(string, string) string
	activities   func(string) string
	live         func(string, string, string, string) string
	forAI        func(string) string
	briefs       func(string) string
	placed       func(string) string
	aiPage       func(string) string
	pagePlaced   func(string) string
	item         func(string, string) string
	use          goja.Callable
	disabledFor  goja.Callable
	disabled     []string
	aiCatalog    json.RawMessage
	modules      plugin.Modules
	warnings     []string
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
	// レコードを引く口を今渡されているか（渡されていない間の「無い」は、無いのか分からないのかを見分けられないので）
	if err := vm.Set("matomezuHostReads", func() bool { return e.source != nil }); err != nil {
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
	// engine.js の関数を Go の関数として受け取る（JS の名前 → 受け先）
	for _, f := range []struct {
		name string
		to   any
	}{
		{"matomezuKinds", &e.kinds},
		{"matomezuAiRows", &e.aiRows},
		{"matomezuKeysOf", &e.keysOf},
		{"matomezuSearchTextsOf", &e.searchOf},
		{"matomezuParentsOf", &e.parentsOf},
		{"matomezuUnlistedOf", &e.unlisted},
		{"matomezuPerform", &e.perform},
		{"matomezuAiCatalog", &e.readAI},
		{"matomezuCheckBooks", &e.check},
		{"matomezuCheckOutsidePages", &e.checkOutside},
		{"matomezuCheckLibrary", &e.checkTree},
		{"matomezuWarningLines", &e.lines},
		{"matomezuReadSettings", &e.settings},
		{"matomezuCheckAnnotations", &e.notes},
		{"matomezuAnnotationsWithout", &e.without},
		{"matomezuAiAnnotations", &e.forAI},
		{"matomezuAiBriefs", &e.briefs},
		{"matomezuAiPlaced", &e.placed},
		{"matomezuAiPage", &e.aiPage},
		{"matomezuAiPagePlaced", &e.pagePlaced},
		{"matomezuAiItem", &e.item},
		{"matomezuTalkActions", &e.talk},
		{"matomezuJoinActions", &e.join},
		{"matomezuEndActions", &e.end},
		{"matomezuHostActions", &e.hosts},
		{"matomezuParticipantAlive", &e.alive},
		{"matomezuParticipantLapsesAt", &e.lapsesAt},
		{"matomezuUpdateCheck", &e.updateCheck},
		{"matomezuHostSettings", &e.hostSettings},
		{"matomezuCheckRecords", &e.records},
		{"matomezuRunOnceActions", &e.once},
		{"matomezuSystemFolderTitles", &e.sysFolders},
		{"matomezuSettleLibrary", &e.settle},
		{"matomezuSettleFailed", &e.settleFail},
		{"matomezuMovedIfOff", &e.movedIfOff},
		{"matomezuPurgedRows", &e.purge},
		{"matomezuSubjectRoles", &e.roles},
		{"matomezuAiRecords", &e.aiRecords},
		{"matomezuRecordBooks", &e.recordBooks},
		{"matomezuRecordNeeds", &e.needs},
		{"matomezuJoinedText", &e.joinedMsg},
		{"matomezuVisitorJoinedText", &e.visitorMsg},
		{"matomezuWorkTitle", &e.workTitle},
		{"matomezuWorkShift", &e.workShift},
		{"matomezuIsAdminWorkroom", &e.isAdmin},
		{"matomezuMyWorkdesk", &e.myWorkdesk},
		{"matomezuWorkroomActivities", &e.activities},
		{"matomezuUnexpired", &e.live},
	} {
		if err := vm.ExportTo(vm.Get(f.name), f.to); err != nil {
			return nil, fmt.Errorf("engine.js has no %s: %w", f.name, err)
		}
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

// randomUUID は版 4 の UUID（画面の crypto.randomUUID と同じ形）
func randomUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
