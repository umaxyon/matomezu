package server

// 追加プラグインは、動いている途中でも足す・入れ替える・外すことができる。
// 変えるたびに、ホストのエンジンをビルトインプラグインと全部の追加プラグインで組み直し（アクションとは鍵 mu で順に）、
// 画面に plugins を知らせる（画面は読み直す）。組み直せなければ前のまま。

import (
	"fmt"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/plugin"
)

// PluginFiles は画面に配る追加プラグイン 1 つ
type PluginFiles struct {
	ID  string
	UI  []byte // 画面で import() する JS（ES モジュール）
	CSS []byte // 無ければ nil
}

// LinkPlugin は開発者プロジェクトのフォルダを変換して足す。同じ id のものがあれば入れ替える。返すのはプラグインの id
func (h *Hub) LinkPlugin(dir string) (string, error) {
	b, err := plugin.Build(dir, h.engine.Modules())
	if err != nil {
		return "", err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	next := slices.Clone(h.plugins)
	if i := slices.IndexFunc(next, func(p *plugin.Bundle) bool { return p.Manifest.ID == b.Manifest.ID }); i >= 0 {
		next[i] = b
	} else {
		next = append(next, b)
	}
	if err := h.usePlugins(next); err != nil {
		return "", err
	}
	return b.Manifest.ID, nil
}

// UnlinkPlugin は id の追加プラグインを外す
func (h *Hub) UnlinkPlugin(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	next := slices.DeleteFunc(slices.Clone(h.plugins), func(p *plugin.Bundle) bool { return p.Manifest.ID == id })
	if len(next) == len(h.plugins) {
		return fmt.Errorf("no plugin %q", id)
	}
	return h.usePlugins(next)
}

// usePlugins はホストのエンジンを組み直し、画面に知らせる（h.mu を持って呼ぶ）
func (h *Hub) usePlugins(next []*plugin.Bundle) error {
	if _, err := h.engine.Use(next); err != nil {
		return err
	}
	// 注意は止めずに、常駐のログ（標準エラー）に書く。読めるブックも今のプラグインで確かめ直す
	for _, n := range h.engine.Notices() {
		fmt.Fprintln(os.Stderr, "notice:", n)
	}
	if err := h.checkBooks(h.order); err != nil {
		return err
	}
	h.plugins = next
	h.pluginsVersion++
	h.broadcast("plugins", map[string]any{"version": h.pluginsVersion})
	return nil
}

// Plugins は画面に配る追加プラグインと、変わるたびに進む版
func (h *Hub) Plugins() ([]PluginFiles, int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	files := make([]PluginFiles, len(h.plugins))
	for i, b := range h.plugins {
		files[i] = PluginFiles{ID: b.Manifest.ID, UI: b.UI, CSS: b.CSS}
	}
	return files, h.pluginsVersion
}
