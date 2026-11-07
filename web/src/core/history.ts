// 画面の履歴（Undo・Redo）: 利用者の 1 回の操作で変わったブックの前と後を画面の履歴の段 1 つに持つ（store が作り、戻す・やり直すのは base の history）。
// AI とほかの窓の変更は、まだ見ていない画面の履歴の段として store が溜め、変えた物が見えたら時刻の位置に差し込む
import type { Patch } from "./patch"
import type { Book } from "./schema/book"

// 画面の履歴の段を作った物: この窓の利用者・AI・ほかの窓
export type HistoryBy = "user" | "ai" | "window"

// 画面の履歴の段: 変えたブックごとの前と後（1 回の操作が、いくつかのブックを変えることがある）。at は始めた時点（この窓の時計）
export interface HistoryStep {
  at: string
  by: HistoryBy
  books: Readonly<Record<string, { before: Book; after: Book }>>
}

// ブックごとの履歴: 戻せる画面の履歴の段（古い順）と、やり直せる画面の履歴の段（古い順。最後が次にやり直す物）
export interface BookHistory {
  undo: readonly HistoryStep[]
  redo: readonly HistoryStep[]
}
export const NO_HISTORY: BookHistory = { undo: [], redo: [] }
export const HISTORY_LIMIT = 100 // ブックごとに覚える画面の履歴の段の数（まだ見ていない画面の履歴の段も、ブックごとにこの数まで）

// 履歴 was の戻せる画面の履歴の段に、step を時刻の位置で差し込む（後ろから見て、at の大きい物の前。やり直せる画面の履歴の段は消さない）
export function insertStep(was: BookHistory, step: HistoryStep): BookHistory {
  let i = was.undo.length
  while (i > 0 && (was.undo[i - 1] as HistoryStep).at > step.at) i--
  return { ...was, undo: [...was.undo.slice(0, i), step, ...was.undo.slice(i)].slice(-HISTORY_LIMIT) }
}

// 物が見えているかを答える関数（土台が、見せ方の seen とステージの表示領域から作る）: ブック book のページ page の物 item（最上位のアイテムか子の形）が、見える所にあるか
export type SeenTest = (page: string, item: string, book: Book) => boolean

// アイテムの Patch p（id は item）が変えた物の id: そのアイテムのフィールドを変えたならそのアイテム、子の形（shapes）を変えたならその子（子の中も同じ）
function changedIds(item: string, p: Patch): string[] {
  if (!("fields" in p)) return [item]
  const own = Object.keys(p.fields).some(k => k !== "shapes") ? [item] : []
  const shapes = p.fields.shapes
  const children = shapes && "list" in shapes ? shapes.list.flatMap(q => changedIds(q.id, q.patch)) : []
  return own.length + children.length > 0 ? [...own, ...children] : [item]
}

// まだ見ていない変更（ブックを before から after にした Patch made）が、そのブックのページ page（ページを持たなければ null）を開いているステージで見えたか（どれか 1 つが見えたら全体）。
// ブックやページのフィールドの変更は、開いていれば見えたとする。アイテムは、変えた物（子の形を変えたならその子）を seen に前と後のブックで聞き（消えた物は前の場所）、
// seen が無ければ見えたとする
export function changeSeen(
  made: Patch,
  change: { before: Book; after: Book },
  page: string | null,
  seen?: SeenTest,
): boolean {
  if (page === null || !("fields" in made) || Object.keys(made.fields).some(k => k !== "pages")) return true
  const pages = made.fields.pages
  if (!pages || !("list" in pages) || pages.list.length === 0) return true
  const q = pages.list.find(x => x.id === page)
  if (!q) return false
  if (!("fields" in q.patch) || Object.keys(q.patch.fields).some(k => k !== "items")) return true
  const items = q.patch.fields.items
  if (!items || !("list" in items) || items.list.length === 0 || !seen) return true
  return items.list
    .flatMap(i => changedIds(i.id, i.patch))
    .some(id => seen(page, id, change.after) || seen(page, id, change.before))
}
