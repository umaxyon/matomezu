// 画面の履歴（Undo・Redo）: 利用者の 1 回の操作で変わったブックの前と後を画面の履歴の段 1 つに持つ（store が作り、戻す・やり直すのは base の history）。
// AI とほかの窓の変更は、まだ見ていない画面の履歴の段として store が溜め、変えた物が見えたら時刻の位置に差し込む
import { overlaps, patchOf } from "./patch"
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

// まだ見ていない画面の履歴の段 step がブックで変えた所を、この窓の利用者の変更（ブックを before から now にした）が上書きしたか
export function stepOverwritten(step: HistoryStep, before: Book, now: Book): boolean {
  const b = step.books[now.id]
  const made = b && patchOf(b.before, b.after)
  const mine = patchOf(before, now)
  return !!made && !!mine && overlaps(made, mine)
}

// 物が見えているかを答える関数（ブックのタイプごとのビューが知らせる）: ブック book のページ page の、最上位のアイテム item が、見える所にあるか
export type SeenTest = (page: string, item: string, book: Book) => boolean

// まだ見ていない画面の履歴の段 step の変更が、ブック book のページ page（ページを持たなければ null）を開いているステージで見えたか（どれか 1 つが見えたら全体）。
// ブックやページのフィールドの変更は、開いていれば見えたとする。アイテムは seen に前と後のブックで聞き（消えた物は前の場所）、seen が無ければ見えたとする
export function stepSeen(step: HistoryStep, book: string, page: string | null, seen?: SeenTest): boolean {
  const b = step.books[book]
  const p = b && patchOf(b.before, b.after)
  if (!b || !p) return false
  if (page === null || !("fields" in p) || Object.keys(p.fields).some(k => k !== "pages")) return true
  const pages = p.fields.pages
  if (!pages || !("list" in pages) || pages.list.length === 0) return true
  const q = pages.list.find(x => x.id === page)
  if (!q) return false
  if (!("fields" in q.patch) || Object.keys(q.patch.fields).some(k => k !== "items")) return true
  const items = q.patch.fields.items
  if (!items || !("list" in items) || items.list.length === 0 || !seen) return true
  return items.list.some(i => seen(page, i.id, b.after) || seen(page, i.id, b.before))
}
