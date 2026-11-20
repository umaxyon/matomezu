package server

// 追加プラグインは、動いている途中でも足す・入れ替える・外すことができる。
// 変えるたびに、ホストのエンジンをビルトインプラグインと全部の追加プラグインで組み直し（アクションとは鍵 mu で順に）、
// 窓に plugins を知らせる（窓は読み直す）。組み直せなければ前のまま。

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/plugin"
)

// PluginFiles は画面に配る追加プラグイン 1 つ
type PluginFiles struct {
	ID       string
	UI       []byte // 画面で import() する JS（ES モジュール）
	CSS      []byte // 無ければ nil
	Disabled bool   // 利用者が有効にしていない（画面も、名乗りと文言だけで組む）
}

// LinkPlugin は開発者プロジェクトのフォルダを変換して足す。同じ id のものがあれば入れ替える。返すのはプラグインの id
func (h *Hub) LinkPlugin(dir string) (string, error) {
	b, err := plugin.Build(dir, h.engine.Modules())
	if err != nil {
		return "", err
	}
	defer h.afterCatalogChange()
	h.mu.Lock()
	defer h.mu.Unlock()
	next := slices.Clone(h.plugins)
	if i := slices.IndexFunc(next, func(p *plugin.Bundle) bool { return p.Manifest.ID == b.Manifest.ID }); i >= 0 {
		next[i] = b
	} else {
		next = append(next, b)
	}
	if err := h.usePlugins(next, ""); err != nil {
		return "", err
	}
	return b.Manifest.ID, nil
}

// UnlinkPlugin は id の追加プラグインを外し、そのプラグインが足した種類のアノテーションを消す
// （外したプラグインの物はもう使わない。プラグインを入れずに起動したときや、版が変わって種類が無くなったときは消さずに warning にする）
// errNoPlugin は、外すよう頼まれた id の追加プラグインを足していない
var errNoPlugin = errors.New("no plugin")

func (h *Hub) UnlinkPlugin(id string) error {
	defer h.afterCatalogChange()
	h.mu.Lock()
	defer h.mu.Unlock()
	next := slices.DeleteFunc(slices.Clone(h.plugins), func(p *plugin.Bundle) bool { return p.Manifest.ID == id })
	if len(next) == len(h.plugins) {
		return fmt.Errorf("%w %q", errNoPlugin, id)
	}
	if err := h.usePlugins(next, ""); err != nil {
		return err
	}
	return h.dropAnnotationsOf(id)
}

// dropAnnotationsOf は、プラグイン id が足した種類のアノテーションを消して知らせる（どの種類がそのプラグインの物かはエンジンが決める。h.mu を持って呼ぶ）
func (h *Hub) dropAnnotationsOf(id string) error {
	kept := map[string]json.RawMessage{}
	for page, body := range h.annotations {
		without, changed, err := h.engine.AnnotationsWithout(id, body)
		if err != nil {
			return err
		}
		if changed {
			kept[page] = without
		}
	}
	if err := h.putAnnotationLists(kept); err != nil {
		return err
	}
	return h.checkAnnotations()
}

// usePlugins はホストのエンジンを組み直し、窓に知らせる。by は、組み直しを起こした設定の変更を頼んだ窓（設定の変更でなければ空）。
// 知らせ plugins には、読めない物のフォルダへ移した物（訳ごとの数）と戻した物の数と by を添える（窓は読み直したあとに知らせる。h.mu を持って呼ぶ）
func (h *Hub) usePlugins(next []*plugin.Bundle, by string) error {
	before := h.engine.Warnings()
	if _, err := h.engine.UseFor(next, h.settingsForPlugins()); err != nil {
		return err
	}
	// 今のプラグインでブックを確かめられるかを見る。確かめられなければ、エンジンを前の組に戻す（h.plugins と warning の一覧は前のまま）。
	// warning の一覧に持つのは、読めない物を移したあと（移す物を 1 冊ずつの warning にしない）
	if _, err := h.engine.CheckBooks(h.bookBodies(h.order)); err != nil {
		if _, back := h.engine.UseFor(h.plugins, h.settingsForPlugins()); back != nil {
			fmt.Fprintln(os.Stderr, "engine: could not go back to the previous plugins:", back)
		}
		return err
	}
	if err := h.checkAnnotations(); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the annotations:", err)
	}
	if err := h.loadRoles(); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not read the roles of the subjects:", err)
	}
	if err := h.syncKinds(); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not tell the storage the kinds of records:", err)
	}
	if err := h.checkRecords(); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the records:", err)
	}
	// 定義の warning は止めずに、新しく出たものだけ常駐のログ（標準エラー）に書く
	for _, n := range h.engine.Warnings() {
		if !slices.Contains(before, n) {
			fmt.Fprintln(os.Stderr, "warning:", n)
		}
	}
	h.plugins = next
	h.disabled = h.engine.Disabled()
	h.loadSystemFolderTitles()
	// 読めない物を移し、読めるようになった物を戻す（窓は plugins の知らせで読み直すので、窓には知らせない）。そのあとのブックを確かめ直す
	moved, returned := h.settleLibrary(true)
	if err := h.checkBooks(h.order); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the books:", err)
	}
	h.catalogChanged = true
	h.pluginsVersion++
	told := map[string]any{"version": h.pluginsVersion}
	if len(moved) > 0 {
		told["moved"] = moved
	}
	if returned > 0 {
		told["returned"] = returned
	}
	if by != "" && (len(moved) > 0 || returned > 0) {
		told["by"] = by
	}
	h.broadcast("plugins", told)
	return nil
}

// Plugins は画面に配る追加プラグインと、変わるたびに進む版
func (h *Hub) Plugins() ([]PluginFiles, int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	files := make([]PluginFiles, len(h.plugins))
	for i, b := range h.plugins {
		files[i] = PluginFiles{ID: b.Manifest.ID, UI: b.UI, CSS: b.CSS, Disabled: slices.Contains(h.disabled, b.Manifest.ID)}
	}
	return files, h.pluginsVersion
}

// reusePluginsForSettings は、利用者の設定が変わったあと、無効になる追加プラグインが変わっていれば、エンジンを組み直す（窓は読み直す。by はその設定の変更を頼んだ窓）。
// 組み直せなければ前のまま（理由は標準エラーに書く）。h.mu を持って呼ぶ
func (h *Hub) reusePluginsForSettings(by string) {
	if len(h.plugins) == 0 {
		return
	}
	now, err := h.engine.DisabledFor(h.settingsForPlugins())
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not decide which plugins are off:", err)
		return
	}
	if slices.Equal(sortedCopy(now), sortedCopy(h.disabled)) {
		return
	}
	if err := h.usePlugins(h.plugins, by); err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not reassemble the plugins for the settings:", err)
	}
}

func sortedCopy(s []string) []string {
	out := slices.Clone(s)
	slices.Sort(out)
	return out
}

// settingsForPlugins は、追加プラグインの有効・無効を決める設定（まだ何も残していなければ空の設定。空なら、追加プラグインはどれも無効）
func (h *Hub) settingsForPlugins() json.RawMessage {
	if len(h.settings) == 0 || string(h.settings) == "null" {
		return json.RawMessage(`{}`)
	}
	return h.settings
}
