package server

// 追加プラグインは、動いている途中でも足す・入れ替える・外すことができる。
// 変えるたびに、ホストのエンジンをビルトインプラグインと全部の追加プラグインで組み直し（アクションとは鍵 mu で順に）、
// 窓に plugins を知らせる（窓は読み直す）。組み直せなければ前のまま。

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

// UnlinkPlugin は id の追加プラグインを外し、そのプラグインが足した種類のアノテーションを消す
// （外したプラグインの物はもう使わない。プラグインを入れずに起動したときや、版が変わって種類が無くなったときは消さずに warning にする）
func (h *Hub) UnlinkPlugin(id string) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	next := slices.DeleteFunc(slices.Clone(h.plugins), func(p *plugin.Bundle) bool { return p.Manifest.ID == id })
	if len(next) == len(h.plugins) {
		return fmt.Errorf("no plugin %q", id)
	}
	if err := h.usePlugins(next); err != nil {
		return err
	}
	return h.dropAnnotationsOf(id)
}

// dropAnnotationsOf は、プラグイン id が足した種類のアノテーションを消して知らせる（どの種類がそのプラグインの物かはエンジンが決める。h.mu を持って呼ぶ）
func (h *Hub) dropAnnotationsOf(id string) error {
	for book, body := range h.annotations {
		kept, changed, err := h.engine.AnnotationsWithout(id, body)
		if err != nil {
			return err
		}
		if !changed {
			continue
		}
		if err := h.putAnnotations(book, kept, "", 0); err != nil {
			return err
		}
	}
	return h.checkAnnotations()
}

// usePlugins はホストのエンジンを組み直し、窓に知らせる（h.mu を持って呼ぶ）
func (h *Hub) usePlugins(next []*plugin.Bundle) error {
	before := h.engine.Warnings()
	if _, err := h.engine.Use(next); err != nil {
		return err
	}
	// 読めるブックを今のプラグインで確かめ直す。確かめ直せなければ、エンジンを前の組に戻す（h.plugins と warning の一覧は前のまま）
	if err := h.checkBooks(h.order); err != nil {
		if _, back := h.engine.Use(h.plugins); back != nil {
			fmt.Fprintln(os.Stderr, "engine: could not go back to the previous plugins:", back)
		}
		return err
	}
	if err := h.checkAnnotations(); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the annotations:", err)
	}
	// 定義の warning は止めずに、新しく出たものだけ常駐のログ（標準エラー）に書く
	for _, n := range h.engine.Warnings() {
		if !slices.Contains(before, n) {
			fmt.Fprintln(os.Stderr, "warning:", n)
		}
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
