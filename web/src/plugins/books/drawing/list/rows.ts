// リストの行の操作（データを書き換えず、新しい値を返す）。リストは図面のページに置いたアイテムで、行は children に順に並ぶ
import type { BookOf } from "../../../../core/schema/book"
import type { DrawingPage } from "../placed"
import { LIST, type ListRow, type RowProps } from "."
import type { PlacedList } from "./placed"
import { placedListWidth, type RowsLines, rewrittenLines } from "./size"

type Drawing = BookOf<"drawing">

export const rowsOf = (list: PlacedList): readonly ListRow[] => list.children ?? []

// ページのリスト list（無いか、リストでなければ null）
export function findList(book: Drawing, pageId: string, list: string): { page: DrawingPage; list: PlacedList } | null {
  const page = book.pages.find(p => p.id === pageId)
  const found = page?.items?.find(i => i.id === list)
  return page && found?.item === LIST.id ? { page, list: found } : null
}

// ページのリストを next に置き換えたブック
export function withList(book: Drawing, page: DrawingPage, next: PlacedList): Drawing {
  const items = (page.items ?? []).map(i => (i.id === next.id ? next : i))
  return { ...book, pages: book.pages.map(p => (p.id === page.id ? { ...page, items } : p)) }
}

// 行を見せる順（行の番号の並び）: チェックリストでチェック済みの行を先頭か最後に寄せる（checkedOrder。ほかの順はデータのまま。データの順は変えない）
export function shownOrder(list: Pick<PlacedList, "props">, rows: readonly ListRow[]): number[] {
  const all = rows.map((_, i) => i)
  const order = list.props.checklist ? list.props.checkedOrder : "none"
  if (order === "none") return all
  const done = all.filter(i => rows[i]?.props.checked === true)
  const rest = all.filter(i => rows[i]?.props.checked !== true)
  return order === "first" ? [...done, ...rest] : [...rest, ...done]
}

// 行をドラッグで動かせるか: チェック済みの行を先頭か最後に寄せて見せているリストでは、チェック済みの行は動かせない（落としても、見せる順で寄せ直されるため）
export function canCarry(list: Pick<PlacedList, "props">, row: ListRow): boolean {
  return !(list.props.checklist && list.props.checkedOrder !== "none" && row.props.checked === true)
}

// リストの行 ids（無ければ全部の行）の行数を lines に書き換えたリスト（RowsLines。行数の数え方はリストの幅とチェックリストかで決まる）
export function withRowLines(list: PlacedList, lines: RowsLines, ids?: readonly string[]): PlacedList {
  const rows = rowsOf(list)
  const targets = new Set(ids ?? rows.map(r => r.id))
  const picked = rows.filter(r => targets.has(r.id))
  const w = list.w ?? placedListWidth(list.props.caption)
  const counts = rewrittenLines(picked, w, list.props.checklist, lines)
  const to = new Map(picked.map((r, i) => [r.id, counts[i]]))
  const children = rows.map(r => {
    if (!targets.has(r.id)) return r
    const { lines: _, ...rest } = r.props
    const n = to.get(r.id)
    return { ...r, props: (n === undefined ? rest : { ...rest, lines: n }) as RowProps }
  })
  return { ...list, children }
}
