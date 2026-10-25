// Package engine は、画面と同じ core のアクションを常駐の中で行う。
//
// engine.js は web/src/engine/engine.ts をまとめたもの（bun run build:engine。作り直して差分が無いことはテストが見張る）。
// goja で動かす。goja の実行環境は同時に使えないので、1 つを鍵で守って順に使う。
package engine

import (
	"crypto/rand"
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/dop251/goja"
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
	perform   func(string) string
	aiCatalog json.RawMessage
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
	e := &Engine{}
	if err := vm.ExportTo(vm.Get("matomezuPerform"), &e.perform); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuPerform: %w", err)
	}
	var aiCatalog func() string
	if err := vm.ExportTo(vm.Get("matomezuAiCatalog"), &aiCatalog); err != nil {
		return nil, fmt.Errorf("engine.js has no matomezuCatalog: %w", err)
	}
	e.aiCatalog = json.RawMessage(aiCatalog())
	return e, nil
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
