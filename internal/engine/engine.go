// Package engine は、画面と同じ core のアクションを常駐の中で行う。
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
	"sync"

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
	Lang     string            `json:"lang"`
	IDs      []string          `json:"ids,omitempty"`
	Now      string            `json:"now,omitempty"` // 画面で先に行った時点（無ければエンジンが決める）
	Books    []json.RawMessage `json:"books"`
	Settings json.RawMessage   `json:"settings"`
}

// On はアクションの宛先のブック
type On struct {
	Book string `json:"book"`
}

// Output は行った結果。断ったときは OK が false で Reason に理由。
// Books は変わった・足したブック、Removed は一覧から無くなったブック、Settings は変わった設定（変わらなければ空）
type Output struct {
	OK       bool              `json:"ok"`
	Reason   string            `json:"reason,omitempty"`
	Result   json.RawMessage   `json:"result,omitempty"`
	Books    []json.RawMessage `json:"books,omitempty"`
	Removed  []string          `json:"removed,omitempty"`
	Settings json.RawMessage   `json:"settings,omitempty"`
}

// Engine は読み込んだ core
type Engine struct {
	mu        sync.Mutex
	vm        *goja.Runtime
	perform   func(string) string
	readAI    func() string
	use       goja.Callable
	aiCatalog json.RawMessage
	modules   plugin.Modules
	notices   []string
}

// New は core を読み込む
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
// 動かせない・default でプラグインを出していない・manifest と id が違う・組み立てで食い違うなら誤りで、前の組み立てのまま
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
			id = obj.Get("id").String()
		}
		if !ok || obj.Get("id") == nil || id == "" {
			return nil, fmt.Errorf("plugin %s: %s must export the plugin as default (export default definePlugin(...))", b.Dir, b.Manifest.Engine)
		}
		if id != b.Manifest.ID {
			return nil, fmt.Errorf("plugin %s: the id in %s is %q, but %s exports %q", b.Dir, plugin.ManifestFile, b.Manifest.ID, b.Manifest.Engine, id)
		}
		plugins = append(plugins, v)
		ids = append(ids, id)
	}
	res, err := e.use(goja.Undefined(), e.vm.NewArray(plugins...))
	if err != nil {
		return nil, fmt.Errorf("plugins: %w", err)
	}
	var notices []string
	if err := e.vm.ExportTo(res, &notices); err != nil {
		return nil, fmt.Errorf("plugins: %w", err)
	}
	e.notices = notices
	e.aiCatalog = json.RawMessage(e.readAI())
	return ids, nil
}

// Notices は、最後に組み直したときの注意（止めるほどではない間違い。1 行ずつ）
func (e *Engine) Notices() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.notices
}

// Perform はアクションを行う
func (e *Engine) Perform(in Input) (out Output, err error) {
	b, err := json.Marshal(in)
	if err != nil {
		return Output{}, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("engine: %v", r)
		}
	}()
	if err := json.Unmarshal([]byte(e.perform(string(b))), &out); err != nil {
		return Output{}, err
	}
	return out, nil
}

// AICatalog は AI 向けの機能台帳（アクションとアイテムなど） {"actions": [{"id", "target", "title", "args"}], "items": [{"id", "title", "size", "props"}]}。
// args と props は JSON Schema
func (e *Engine) AICatalog() json.RawMessage {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.aiCatalog
}

// randomUUID は版 4 の UUID（画面の crypto.randomUUID と同じ形）
func randomUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
