// 画面の履歴（Undo・Redo）: 利用者の 1 回の操作で変わったページとフォルダの前と後を画面の履歴の段 1 つに持つ（store が作り、戻す・やり直すのは base の history）。
// AI とほかの窓の変更は、まだ見ていない画面の履歴の段として store が溜め、変えた物が見えたら時刻の位置に差し込む
import { type Folder, type Folders, foldersOver, type Library, type PageRow, type TableChanges } from "./folders"
import type { ListPatch, Patch } from "./patch"
import { REMOVED } from "./records"
import { sameData } from "./same"
import type { Book } from "./schema/book"

// ページ・フォルダ 1 つの、変わる前と後（無いときは "none"）
export interface RowChange<T> {
  before: T | "none"
  after: T | "none"
}

// 画面の履歴の段を作った物: この窓の利用者・AI・ほかの窓
export type HistoryBy = "user" | "ai" | "window"

// 画面の履歴の段: 変えたページとフォルダごとの前と後（足した物の前と、無くした物の後は "none"）。at は始めた時点（この窓の時計）。
// books は、変えた物を持つブックの id（この段を入れる履歴。1 回の操作が、いくつかのブックを変えることがある）
export interface HistoryStep {
  at: string
  by: HistoryBy
  books: readonly string[]
  pages: Readonly<Record<string, RowChange<PageRow>>>
  folders: Readonly<Record<string, RowChange<Folder>>>
}

// 表 was を changes のとおりに変えた、ページとフォルダごとの前と後（画面の履歴の段が持つ形）
export function rowChangesOf(was: Library, changes: TableChanges): Pick<HistoryStep, "pages" | "folders"> {
  const rows = <T>(table: Readonly<Record<string, T>>, to: Readonly<Record<string, T | typeof REMOVED>>) =>
    Object.fromEntries(
      Object.entries(to).map(([id, v]): [string, RowChange<T>] => [
        id,
        { before: table[id] ?? "none", after: v === REMOVED ? "none" : (v as T) },
      ]),
    )
  return { pages: rows(was.pages, changes.pages), folders: rows(was.folders, changes.folders) }
}

// 画面の履歴（ブックごとと、書庫に 1 つ）: 戻せる画面の履歴の段（古い順）と、やり直せる画面の履歴の段（古い順。最後が次にやり直す物）
export interface History {
  undo: readonly HistoryStep[]
  redo: readonly HistoryStep[]
}
export const NO_HISTORY: History = { undo: [], redo: [] }
// 書庫の画面の履歴の鍵（ブックごとの履歴と同じ表に、この鍵で持つ）: 書庫が対象のアクションが変えたページとフォルダの段。ブックが対象・ページが対象のアクションの段は、ブックの履歴に入る
export const LIBRARY_HISTORY = "library"
export const HISTORY_LIMIT = 100 // ブックごとに覚える画面の履歴の段の数（まだ見ていない画面の履歴の段も、ブックごとにこの数まで）

// 履歴 was の戻せる画面の履歴の段に、step を時刻の位置で差し込む（後ろから見て、at の大きい物の前。やり直せる画面の履歴の段は消さない）
export function insertStep(was: History, step: HistoryStep): History {
  let i = was.undo.length
  while (i > 0 && (was.undo[i - 1] as HistoryStep).at > step.at) i--
  return { ...was, undo: [...was.undo.slice(0, i), step, ...was.undo.slice(i)].slice(-HISTORY_LIMIT) }
}

// 履歴 was の、戻す・やり直すで動かした段 step を、動かす前に在った側 from へ戻した履歴（動かした先に無ければ was のまま）。
// 戻す所は時刻の位置（戻せる側は古い順、やり直せる側は新しい順。その間にほかの段を動かしていても、並びを保つ）
export function putBackStep(was: History, step: HistoryStep, from: "undo" | "redo"): History {
  const to = from === "undo" ? "redo" : "undo"
  if (!was[to].includes(step)) return was
  const later = (s: HistoryStep) => (from === "undo" ? s.at > step.at : s.at < step.at)
  const i = was[from].findIndex(later)
  const at = i < 0 ? was[from].length : i
  return {
    ...was,
    [to]: was[to].filter(s => s !== step),
    [from]: [...was[from].slice(0, at), step, ...was[from].slice(at)],
  } as History
}

// 書庫の変更（ページとフォルダの行 rows を、フォルダの表 before から after にした）の、近くのフォルダ。このどれかの中身を、見えているスクリーンの書庫アピアランスが並べて見せていれば、
// その変更は見えたとする: 並びの変わったフォルダは、そのフォルダ（入った・出た・順が変わったエントリは、そこで見える）。並びのほかが変わった物（名前など）と、
// 足した・無くした物は、それを前か後に入れていたフォルダ（そのエントリは、入れ物の中身として見える）
export function foldersNear(rows: Pick<HistoryStep, "pages" | "folders">, before: Folders, after: Folders): string[] {
  const near = new Set<string>()
  const holders = (id: string) => {
    for (const folders of [before, after]) {
      const holder = foldersOver(folders, id)[0]
      if (holder) near.add(holder.id)
    }
  }
  for (const id of Object.keys(rows.pages)) holders(id)
  for (const [id, row] of Object.entries(rows.folders)) {
    if (row.before === "none" || row.after === "none") {
      holders(id)
      continue
    }
    const { lineup: was, ...head } = row.before
    const { lineup: now, ...next } = row.after
    if (!sameData(was, now)) near.add(id)
    if (!sameData(head, next)) holders(id)
  }
  return [...near]
}

// 物が見えているかを答える関数（土台が、プレゼンテーションの seen とステージの表示領域から作る）: ブック book のページ page の物 item（最上位のアイテムか子の形）が、見える所にあるか
export type SeenTest = (page: string, item: string, book: Book) => boolean

// アイテムの Patch p（id は item）が変えた物の id: そのアイテムのフィールドを変えたならそのアイテム、子の形（shapes）を変えたならその子（子の中も同じ）
function changedIds(item: string, p: Patch): string[] {
  if (!("fields" in p)) return [item]
  const own = Object.keys(p.fields).some(k => k !== "shapes") ? [item] : []
  const shapes = p.fields.shapes
  const children = shapes && "list" in shapes ? shapes.list.flatMap(q => changedIds(q.id, q.patch)) : []
  return own.length + children.length > 0 ? [...own, ...children] : [item]
}

// 並びの Patch の中の、ページ page の Patch（ページ page に触れていなければ undefined）。バインダの中のページは、バインダの要素の中の並び（lineup）をたどる。
// 中の並び（lineup）のフィールドを持つのはバインダだけ（ページは lineup という名前のフィールドを持てない。台帳アセンブルの E030）
function patchOfPage(list: readonly ListPatch[], page: string): ListPatch | undefined {
  for (const x of list) {
    if (x.id === page) return x
    const inner = "fields" in x.patch ? x.patch.fields.lineup : undefined
    const found = inner && "list" in inner ? inner.list.find(y => y.id === page) : undefined
    if (found) return found
  }
  return undefined
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
  if (page === null || !("fields" in made) || Object.keys(made.fields).some(k => k !== "lineup")) return true
  const lineup = made.fields.lineup
  if (!lineup || !("list" in lineup) || lineup.list.length === 0) return true
  const q = patchOfPage(lineup.list, page)
  if (!q) return false
  if (!("fields" in q.patch) || Object.keys(q.patch.fields).some(k => k !== "items")) return true
  const items = q.patch.fields.items
  if (!items || !("list" in items) || items.list.length === 0 || !seen) return true
  return items.list
    .flatMap(i => changedIds(i.id, i.patch))
    .some(id => seen(page, id, change.after) || seen(page, id, change.before))
}
