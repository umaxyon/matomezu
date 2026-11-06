// 送信トレイの並び: 開いているブックのアノテーション（伝言・マークなど）を、結び付く物の最後のあるページごとに、ブックのページの順で分け、
// ページの中は付けた時点（種類の listed が答える）の新しい順に並べる。付けた時点を答えない種類の物は、その後ろに並びの順で。ページの見つからない物は最後のまとまり
import { type AiAnnotation, type Annotation, annotationsForAi } from "../../../core/annotation"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { addedAtOf } from "./listed"

export interface ListedPage {
  page: string | null // ページの id（見つからない物のまとまりは null）
  title: string // ページの名前（null のまとまりは空）
  rows: readonly AiAnnotation[] // awaits が false なら、AI が読んだもの
}

export function listedPages(catalog: CoreCatalog, book: Book, annotations: readonly Annotation[]): ListedPage[] {
  const all = annotationsForAi(catalog, book, annotations)
  const newest = (rows: readonly AiAnnotation[]) =>
    rows
      .map((a, i) => ({ a, i, at: addedAtOf(catalog, a) }))
      .sort((x, y) => (x.at && y.at ? y.at.localeCompare(x.at) : x.at ? -1 : y.at ? 1 : x.i - y.i))
      .map(r => r.a)
  const pages = "pages" in book ? (book.pages as readonly { id: string; title?: string }[]) : []
  const listed: ListedPage[] = pages.flatMap(p => {
    const rows = all.filter(a => a.page === p.id)
    return rows.length > 0 ? [{ page: p.id, title: p.title ?? "", rows: newest(rows) }] : []
  })
  const lost = all.filter(a => a.page === null || !pages.some(p => p.id === a.page))
  return lost.length > 0 ? [...listed, { page: null, title: "", rows: newest(lost) }] : listed
}
