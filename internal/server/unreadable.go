package server

// 読めない物のフォルダ: 書庫の一番上のフォルダの 1 つ（フォルダの行 library-unreadable。storage/library.go）。今の機能台帳で読めない物は、在った所からここへ移り、
// 読めるようになると在った所へ戻る（core/unreadable.ts が決め、常駐が書く。アクションでなく、窓の履歴に入らない。認可ステップと編集ロックは掛けない）。
// 行うのは、常駐が起動したとき・機能台帳が変わったとき・テストの用意で世界を置き直したとき（ふつうの書き込みのあとは行わない）。
// 中の物は書庫に入らない: 窓とエンジンの書庫（core の readLibrary）に入らず、AI の MCP 公開ツールと CLI にも出さない（名指されたら、無い物として断る）。
// アクションは、中の物の行と読めない物のフォルダの行を変えられない（perform の書き込みの守り）。中の物に利用者ができるのは、完全に消す事だけ

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"slices"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// inUnreadable は、エントリ id が、読めない物のフォルダの中（何段下でも）に在るか（h.mu を持って呼ぶ）
func (h *Hub) inUnreadable(id string) bool {
	return slices.Contains(h.foldersAbove(id), storage.UnreadableID)
}

// outOfSight は、エントリ id が、AI と CLI に見せない物か: ゴミ箱の中か、読めない物のフォルダの中に在るか、確かめる関数が開けないとしたブック（読めないブック）か、その中に在る（h.mu を持って呼ぶ）
func (h *Hub) outOfSight(id string) bool {
	if h.bookWarnings[id].Unreadable {
		return true
	}
	for _, at := range h.foldersAbove(id) {
		if at == storage.TrashID || at == storage.UnreadableID || h.bookWarnings[at].Unreadable {
			return true
		}
	}
	return false
}

// allRows は、置き場所の行の全部（ページとフォルダの本文。id の順。h.mu を持って呼ぶ）
func (h *Hub) allRows() (pages, folders []json.RawMessage) {
	pages = make([]json.RawMessage, 0, len(h.pages))
	for _, id := range slices.Sorted(maps.Keys(h.pages)) {
		pages = append(pages, h.pages[id].body)
	}
	folders = make([]json.RawMessage, 0, len(h.folders))
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		folders = append(folders, h.folders[id].body)
	}
	return pages, folders
}

// settleLibrary は、書庫を今の機能台帳に合わせて整える: 読めない物を読めない物のフォルダへ移し、読めるようになった物を在った所へ戻す（1 回の書き込みで。触れた時刻は残さない）。
// quiet なら窓に知らせない（起動の途中・窓が読み直す所）。そうでなければ、変えた行を changed で知らせる。
// 移した・戻した・名前に番号を付けた物と、読めない物の warning（W032）が変わったときは、常駐のログに書く。失敗は止めず、失敗している間は warning（W033）を持つ
// （h.mu を持って呼ぶか、起動の途中で呼ぶ）
func (h *Hub) settleLibrary(quiet bool) {
	pages, folders := h.allRows()
	done, err := h.engine.SettleLibrary(pages, folders, h.settings, stamp())
	if err != nil {
		h.holdSettleFailure("engine", err)
		return
	}
	if done.Broken {
		h.holdSettleFailure("broken", nil)
		return
	}
	if err := h.writeUnreadable(done.Pages, done.Folders, quiet); err != nil {
		h.holdSettleFailure("write", err)
		return
	}
	h.settleWarning = ""
	for _, m := range done.Moved {
		fmt.Fprintln(os.Stderr, "moved to the unreadable folder:", m.ID, m.Code)
	}
	for _, id := range done.Returned {
		fmt.Fprintln(os.Stderr, "back from the unreadable folder:", id)
	}
	for _, n := range done.Numbered {
		fmt.Fprintf(os.Stderr, "the title of %s was taken in its folder; it is now %q\n", n.ID, n.Title)
	}
	h.holdUnreadableWarning(done.Warning)
}

// purgeUnreadable は、読めない物のフォルダの直下の物 id を、中の物の行とページのアノテーションごと置き場所から消す（ほかのフォルダも持つ行は消さない。窓に知らせる）。
// 直下に無ければ false（h.mu を持って呼ぶ）
func (h *Hub) purgeUnreadable(id string) (bool, error) {
	pages, folders := h.allRows()
	done, found, err := h.engine.PurgedRows(pages, folders, id)
	if err != nil || !found {
		return false, err
	}
	if err := h.writeUnreadable(done.Pages, done.Folders, false); err != nil {
		return false, err
	}
	h.holdUnreadableWarning(done.Warning)
	return true, nil
}

// writeUnreadable は、読めない物を移す・戻す・消す行の変わり pages・folders を、perform と同じ書き込みで 1 回に書く（触れた時刻は残さない。quiet なら窓に知らせない）。
// 変わるブック（並びを変えたブック・消すブック）は組み直して確かめ直し、消すページのアノテーションも消す（h.mu を持って呼ぶ）
func (h *Hub) writeUnreadable(pages, folders []engine.RowChange, quiet bool) error {
	if len(pages) == 0 && len(folders) == 0 {
		return nil
	}
	out := engine.Output{OK: true, Pages: pages, Folders: folders, Annotations: map[string]json.RawMessage{}}
	for _, c := range folders {
		if f, ok := h.folders[c.ID]; ok && f.isBook() {
			out.Books = append(out.Books, c.ID)
		}
	}
	for _, c := range pages {
		if _, has := h.annotations[c.ID]; c.Removed && has {
			out.Annotations[c.ID] = json.RawMessage("[]")
		}
	}
	plan, err := h.planWrites(out, "", "", stamp())
	if err != nil {
		return err
	}
	if plan == nil {
		return fmt.Errorf("the rows to write are already in the world")
	}
	plan.quiet = quiet
	plan.untouched = true
	if err := h.store.Apply(plan.batch); err != nil {
		return err
	}
	h.applyWrites(plan, out, Perform{}, "", "")
	return nil
}

// holdUnreadableWarning は、読めない物の warning（W032 の 1 行。無ければ空）を持ち、変わったら常駐のログに書く（h.mu を持って呼ぶ）
// holdSettleFailure は、書庫を整えるのに訳 reason（"engine"・"broken"・"write"。err はその誤り、無ければ nil）で失敗した事の warning（W033）を持つ。
// 変わったときは、常駐のログに warning と誤りを書く（h.mu を持って呼ぶか、起動の途中で呼ぶ）
func (h *Hub) holdSettleFailure(reason string, err error) {
	line, lineErr := h.engine.SettleFailed(reason)
	if lineErr != nil {
		line = "W033 : " + reason
	}
	if line != h.settleWarning {
		fmt.Fprintln(os.Stderr, "warning:", line)
		if err != nil {
			fmt.Fprintln(os.Stderr, "  ", err)
		}
	}
	h.settleWarning = line
}

func (h *Hub) holdUnreadableWarning(line string) {
	if line != "" && line != h.unreadableWarning {
		fmt.Fprintln(os.Stderr, "warning:", line)
	}
	h.unreadableWarning = line
}

// sharedWithUnreadable は、読めない物のフォルダの中のフォルダ（移ったブックなど）が並びに持つのに、置き場所の表 entries ではほかのフォルダに入っている行の id → それを持つ中のフォルダの id
// （読めないブック W006 が、ほかのブックと id を分け合っている行。h.mu を持って呼ぶ）
func (h *Hub) sharedWithUnreadable() map[string]string {
	out := map[string]string{}
	for _, id := range slices.Sorted(maps.Keys(h.folders)) {
		if !h.inUnreadable(id) {
			continue
		}
		for _, e := range h.folders[id].entries {
			if h.places[e] != id {
				out[e] = id
			}
		}
	}
	return out
}

// withoutSharedRemovals は、out から、読めない物のフォルダの中の物も持つ行 shared を消す変わりを除いた物（読めるブックを消しても、移ったブックが持つ行は残す）
func withoutSharedRemovals(out engine.Output, shared map[string]string) engine.Output {
	if len(shared) == 0 {
		return out
	}
	kept := func(changes []engine.RowChange) []engine.RowChange {
		return slices.DeleteFunc(slices.Clone(changes), func(c engine.RowChange) bool { return c.Removed && shared[c.ID] != "" })
	}
	out.Pages, out.Folders = kept(out.Pages), kept(out.Folders)
	return out
}

// keepSharedPlaces は、plan が置き場所の表 entries から外す行のうち、読めない物のフォルダの中の物も持つ行 shared を、それを持つ中のフォルダに入れ直す
func keepSharedPlaces(plan *writePlan, shared map[string]string) {
	for i, e := range plan.batch.Entries {
		if f := shared[e.ID]; f != "" && e.Folder == "" {
			plan.batch.Entries[i].Folder = f
		}
	}
}

// touchesUnreadable は、out が、読めない物のフォルダの行か、その中の物の行に触れるか（アクションは触れられない決まりの、エンジンの後ろの守り。Perform が断る。h.mu を持って呼ぶ）
func (h *Hub) touchesUnreadable(out engine.Output) bool {
	for _, c := range out.Pages {
		if h.inUnreadable(c.ID) {
			return true
		}
	}
	for _, c := range out.Folders {
		if c.ID == storage.UnreadableID || h.inUnreadable(c.ID) {
			return true
		}
	}
	return false
}
