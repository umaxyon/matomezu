// 検索の当たりを、ビューが光らせて見せる部品（見た目）: 開いているページの当たりと今の当たりを読むフック、
// 光らせる Range を名前ごとに窓 1 つの表（CSS Custom Highlight API）へ足し・外すフック、閉じたときに今の当たりを受け取るフック。
// どこを光らせるか（原文の位置から描いた要素の Range を作る）は、描いたビューが決める（ほかのプラグインのビューの中には手を入れない）

import { useEffect, useMemo, useRef } from "react"
import { NO_PAGE } from "../../../core/stage"
import { usePluginState } from "../../../ui/plugin-state-hooks"
import { useCoreCatalog, usePageById } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { SearchHit } from "./find"
import { hitsIn, liveCurrent, searchableOf } from "./search"
import { SEARCH_PICK_STATE, SEARCH_STATE } from "./state"

// 光らせる名前（CSS の ::highlight() で色を付ける。base の SearchDialog.module.css）
export const SEARCH_HIGHLIGHT = "matomezu-search"
export const SEARCH_CURRENT_HIGHLIGHT = "matomezu-search-current"

// 描いている場所のステージのページ page で、光らせる当たり（検索ダイアログを閉じていれば無い）と今の当たり（このページに無ければ none）
export function useSearchHits(page: string): { hits: readonly SearchHit[]; current: SearchHit | "none" } {
  const catalog = useCoreCatalog()
  const shown = usePageById(page)
  // 読むのは探す字と今の当たりだけで、範囲 scope は読まない（開いているページだけを光らせる）ので、useSearchHere を通さない
  const search = usePluginState(kit, SEARCH_STATE)
  return useMemo(() => {
    if (!search || shown === NO_PAGE || searchableOf(catalog, shown) === "none") return { hits: [], current: "none" }
    const found = hitsIn(catalog, [shown], search.query, "page", page)
    if (found === "bad-pattern") return { hits: [], current: "none" }
    const hits = found[0]?.hits ?? []
    // 原文が変わって当たりでなくなった今の当たりは光らせない
    const cur = liveCurrent(found, search.current)
    return { hits, current: cur !== "none" && cur.page === page ? { start: cur.start, end: cur.end } : "none" }
  }, [catalog, shown, search, page])
}

// 名前ごとの、ビューが足した Range（ビューごと）。足す・外すたびに、その名前の光らせる物を作り直す
const owned = new Map<string, Map<symbol, readonly Range[]>>()

function redraw(name: string) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return
  const ranges = [...(owned.get(name)?.values() ?? [])].flat()
  if (ranges.length === 0) CSS.highlights.delete(name)
  else CSS.highlights.set(name, new Highlight(...ranges))
}

// ビューが光らせる Range を名前 name で足す（ranges が変わるたびに差し替え、外したら消す。分割したほかのビューの物と合わせて光らせる）
export function useHighlightRanges(name: string, ranges: readonly Range[]): void {
  const me = useRef(Symbol(name)).current
  useEffect(() => {
    const table = owned.get(name) ?? new Map<symbol, readonly Range[]>()
    owned.set(name, table)
    table.set(me, ranges)
    redraw(name)
    return () => {
      table.delete(me)
      redraw(name)
    }
  }, [name, ranges, me])
}

// 検索ダイアログを閉じたとき、ページ page の今の当たりを pick に渡す（閉じるたびに 1 回）
export function useSearchPick(page: string, pick: (hit: SearchHit) => void): void {
  const picked = usePluginState(kit, SEARCH_PICK_STATE)
  const seen = useRef(picked?.n ?? 0)
  const call = useRef(pick)
  call.current = pick
  useEffect(() => {
    if (!picked || picked.n === seen.current) return
    seen.current = picked.n
    if (picked.page === page) call.current({ start: picked.start, end: picked.end })
  }, [picked, page])
}
