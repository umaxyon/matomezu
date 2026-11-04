// 伝言一覧の並び: 開いているブックのアノテーション（伝言・マークなど）を、結び付く物の最後のあるページごとに、ブックのページの順で分け、
// ページの中は付けた時点（伝言とマークの addedAt）の新しい順に並べる。付けた時点を持たない種類の物は、その後ろに並びの順で。ページの見つからない物は最後のまとまり
import { type AiAnnotation, type Annotation, annotationsForAi } from "../../../core/annotation"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { MARK, type MarkProps } from "../mark"
import { NOTE, type NoteProps } from "../note"

export interface ListedPage {
  page: string | null // ページの id（見つからない物のまとまりは null）
  title: string // ページの名前（null のまとまりは空）
  rows: readonly AiAnnotation[] // awaits が false なら、AI が読んだもの
}

// アノテーション a を付けた時点（伝言とマーク。ほかの種類は null）
export const addedAtOf = (a: Annotation): string | null =>
  a.annotation === NOTE.id
    ? (a.props as NoteProps).addedAt
    : a.annotation === MARK.id
      ? (a.props as MarkProps).addedAt
      : null

export function listedPages(catalog: CoreCatalog, book: Book, annotations: readonly Annotation[]): ListedPage[] {
  const all = annotationsForAi(catalog, book, annotations)
  const newest = (rows: readonly AiAnnotation[]) =>
    rows
      .map((a, i) => ({ a, i, at: addedAtOf(a) }))
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

// 付けた時点 at（ISO の時刻）を、今 now から見た短い形にする: 同じ日なら「時:分」、ほかは「月/日 時:分」（その環境の時刻で）
export function shownTime(at: string, now: Date): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ""
  const hm = `${d.getHours().toString()}:${d.getMinutes().toString().padStart(2, "0")}`
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? hm : `${(d.getMonth() + 1).toString()}/${d.getDate().toString()} ${hm}`
}
