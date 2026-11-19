package server

// 機能台帳に合わせて行うこと: アクションの定義が runAndKeepsWithCatalog で名乗るアクションを、matomezu として利用者の立場で行う（足りないシステムフォルダの行を足すなど）。
// 行うのは、常駐が起動したとき・プラグインが変わって機能台帳が変わったとき（追加プラグインを足す・入れ替える・外す・有効にする・無効にする）と、
// データを書いたあと（書庫のシステムフォルダが機能台帳に合っていないと、軽く確かめられたときだけ）。断られたら、次にまた行う（同じ答えで断られる間は、ログに書き直さない）。
// システムフォルダの名前（AI に見せる英語）も、ここで読み直す

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"github.com/umaxyon/matomezu/internal/storage"
)

// runCatalogActions は、機能台帳に合わせてデータを足すアクションを順に、利用者として行う（h.mu を持たずに呼ぶ。失敗は止めず、ログに書く。
// 行うバルクのあとには、keepWithCatalog を呼ばない）
func (h *Hub) runCatalogActions() {
	ids, err := h.engine.CatalogActions()
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not list the actions to run when the plugins change:", err)
		return
	}
	for _, id := range ids {
		run, err := h.performHeld(performOne(id, json.RawMessage("{}"), nil), id)
		out := run.done
		if err != nil || (!out.OK && !run.repeated) {
			fmt.Fprintln(os.Stderr, "the action", id, "could not run for the plugins:", err, out.Reason, out.Kind, out.Permission, out.Detail)
		}
	}
}

// repeatedRefusal は、機能台帳に合わせてデータを足すアクション id（空ならほかのバルクで、何もしない）の答え done が、前に断られた答えと同じか（h.mu を持って呼ぶ）。
// 断られたら答え（Reason・Kind・Detail と、断ったアクションの番号 at）を覚え、行えたら忘れる
func (h *Hub) repeatedRefusal(id string, done Performed, at *int) bool {
	if id == "" {
		return false
	}
	if done.OK {
		delete(h.catalogRefused, id)
		return false
	}
	where := "-"
	if at != nil {
		where = strconv.Itoa(*at)
	}
	key := done.Reason + "\x00" + done.Kind + "\x00" + done.Detail + "\x00" + where
	same := h.catalogRefused[id] == key
	h.catalogRefused[id] = key
	return same
}

// keepWithCatalog は、機能台帳に合わせてデータを足すアクションを、要るときに行う: プラグインが変わっていたら必ず、wrote（データを書いた）なら、
// 書庫のシステムフォルダが機能台帳に合っていないときだけ（h.mu を放したあとに呼ぶ。defer で呼ぶ所は、h.mu.Unlock の defer より先に書く）
func (h *Hub) keepWithCatalog(wrote bool) {
	h.mu.Lock()
	needed := h.catalogChanged || (wrote && !h.systemFoldersInPlace())
	h.catalogChanged = false
	h.mu.Unlock()
	if needed {
		h.runCatalogActions()
	}
}

// afterCatalogChange は、プラグインが変わっていたら、機能台帳に合わせてデータを足すアクションを行う（h.mu を放したあとに呼ぶ。defer で呼ぶ所は、h.mu.Unlock の defer より先に書く）
func (h *Hub) afterCatalogChange() { h.keepWithCatalog(false) }

// systemFoldersInPlace は、書庫のシステムフォルダが今の機能台帳に合っているか（engine.SystemFoldersInPlace）。エンジンには、書庫ホーム・ゴミ箱・フォルダの行の全部
// （システムフォルダは、その中だけに在る）と、名前を比べる書庫ホームの直下のブック・バインダ・ページの行を渡す。確かめられなければ、ログに書いて合っているとする（h.mu を持って呼ぶ）
func (h *Hub) systemFoldersInPlace() bool {
	folders := h.openRows()
	pages := map[string]json.RawMessage{}
	if home, ok := h.folders[storage.HomeID]; ok {
		for _, e := range home.entries {
			if f, ok := h.folders[e]; ok && !f.isOpen() {
				folders = append(folders, f.body)
			} else if p, ok := h.pages[e]; ok {
				pages[e] = p.body
			}
		}
	}
	ok, err := h.engine.SystemFoldersInPlace(folders, pages, h.settings)
	if err != nil {
		fmt.Fprintln(os.Stderr, "engine: could not check the system folders:", err)
		return true
	}
	return ok
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
