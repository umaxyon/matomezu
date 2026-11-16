// 送信トレイの並び: 開いているブックのアノテーション（伝言・マークなど）を、付いているページごとに、ブックのページの順で分け、
// ページの中は付けた時点（種類の listed が答える）の新しい順に並べる。付けた時点を答えない種類の物は、その後ろに並びの順で

import { type AiAnnotation, type Annotations, annotationsForAi } from "../../../core/annotation"
import { pagesOf } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { addedAtOf } from "./listed"

export interface ListedPage {
  page: string // ページの id
  title: string // ページの名前
  rows: readonly AiAnnotation[] // awaits が false なら、AI が読んだもの
}

// annotations は、ページごとのアノテーション（ページの id → 並び）
export function listedPages(catalog: CoreCatalog, book: Book, annotations: Annotations): ListedPage[] {
  const newest = (rows: readonly AiAnnotation[]) =>
    rows
      .map((a, i) => ({ a, i, at: addedAtOf(catalog, a) }))
      .sort((x, y) => (x.at && y.at ? y.at.localeCompare(x.at) : x.at ? -1 : y.at ? 1 : x.i - y.i))
      .map(r => r.a)
  return pagesOf(book).flatMap(p => {
    const rows = annotationsForAi(catalog, p, annotations[p.id] ?? [])
    return rows.length > 0 ? [{ page: p.id, title: p.title, rows: newest(rows) }] : []
  })
}
