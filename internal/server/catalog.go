package server

// 機能台帳に合わせて行うこと: 常駐が起動したときと、プラグインが変わって機能台帳が変わったとき（追加プラグインを足す・入れ替える・外す・有効にする・無効にする）に、
// アクションの定義が runsWhenCatalogChanges で名乗るアクションを、利用者として行う（足りないシステムフォルダの行を足すなど）。
// 行えなければ、次の起動か次の変化でまた行う。システムフォルダの名前（AI に見せる英語）も、ここで読み直す

import (
	"encoding/json"
	"fmt"
	"os"
)

// runCatalogActions は、機能台帳が変わったときのアクションを順に、利用者として行う（h.mu を持たずに呼ぶ。失敗は止めず、ログに書く）
func (h *Hub) runCatalogActions() {
	ids, err := h.engine.CatalogActions()
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not list the actions to run when the plugins change:", err)
		return
	}
	for _, id := range ids {
		out, err := h.Perform(performOne(id, json.RawMessage("{}"), nil))
		if err != nil || !out.OK {
			fmt.Fprintln(os.Stderr, "the action", id, "could not run for the plugins:", err, out.Reason, out.Kind, out.Permission, out.Detail)
		}
	}
}

// afterCatalogChange は、プラグインが変わっていたら、機能台帳が変わったときのアクションを行う（h.mu を放したあとに呼ぶ。defer で呼ぶ所は、h.mu.Unlock の defer より先に書く）
func (h *Hub) afterCatalogChange() {
	h.mu.Lock()
	changed := h.catalogChanged
	h.catalogChanged = false
	h.mu.Unlock()
	if changed {
		h.runCatalogActions()
	}
}

// loadSystemFolderTitles は、今の機能台帳のシステムフォルダの名前（英語）を読み直す（h.mu を持って呼ぶか、起動の途中で呼ぶ）
func (h *Hub) loadSystemFolderTitles() {
	titles, err := h.engine.SystemFolderTitles()
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not read the titles of the system folders:", err)
		return
	}
	h.systemFolderTitles = titles
}
