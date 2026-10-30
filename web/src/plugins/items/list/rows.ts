// リストの行の操作（データを書き換えず、新しい値を返す）。リストはページに置いたアイテムで、行は children に順に並ぶ

import { type ItemPage, type PagedBook, putPage } from "../../../plugin-api"
import { LIST, type ListRow, type RowProps } from "./list"
import type { PlacedList } from "./placed"
import { placedListWidth, type RowsLines, rewrittenLines } from "./size"

export const rowsOf = (list: PlacedList): readonly ListRow[] => list.children ?? []

// ページのリスト list（無いか、リストでなければ null）
export function findList(book: PagedBook, pageId: string, list: string): { page: ItemPage; list: PlacedList } | null {
  const page = book.pages.find(p => p.id === pageId)
  const found = page?.items?.find(i => i.id === list)
  return page && found?.item === LIST.id ? { page, list: found } : null
}

// ページのリストを next に置き換えたブック
export function withList(book: PagedBook, page: ItemPage, next: PlacedList): PagedBook {
  const items = (page.items ?? []).map(i => (i.id === next.id ? next : i))
  return putPage(book, { ...page, items })
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

// 行を落とす所を決めるための、見えている順の行（落とす行は除く）: チェック済みか、データの順の番号
export interface DropRow {
  id: string
  checked: boolean
  order: number
}

// 行を落とす所: アクション row-move に渡す before（無ければ最後）と、線を引く所（行 before の前・行 after の後ろ・行の並びの先頭）
export interface DropPlace {
  before?: string
  bar: { before: string } | { after: string } | { top: true }
}

// チェック済みを寄せて見せているリスト（gather）に、チェック済みか（checked）の行を落とす所。落とせるのは、その行が寄せられる組（同じチェックの行）の中だけで、
// above(行) が真の最初の組の行の前（無ければ組の最後の後ろ）。組の最後の後ろに落とすときは、データの上でもその行のすぐ後ろに入れる（寄せ直しても落とした所に出る）
export function dropPlace(
  rows: readonly DropRow[],
  gather: "none" | "first" | "last",
  checked: boolean,
  above: (row: string) => boolean,
): DropPlace {
  const group = gather === "none" ? rows : rows.filter(r => r.checked === checked)
  const next = group.find(r => above(r.id))
  if (next) return { before: next.id, bar: { before: next.id } }
  const last = group.at(-1)
  if (!last) {
    // 組に行が無い: 組が先に見えるなら並びの先頭、後に見えるなら最後の行の後ろ
    const end = rows.at(-1)
    return { bar: (gather === "first") === checked || !end ? { top: true } : { after: end.id } }
  }
  const after = rows.filter(r => r.order > last.order).sort((a, b) => a.order - b.order)[0]
  return { ...(after ? { before: after.id } : {}), bar: { after: last.id } }
}
