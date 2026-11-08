// ブックの中を探す（見た目を持たない計算）: 見せ方が探せる口（PresentationExtras の search）を持てば、そのブックのページの原文を探し、
// 今の当たりから次・前の当たりへ進み、当たりを置き換える page-update の fields を作る。探す・置き換える計算は find.ts
import type { CoreCatalog } from "../../../core/core-catalog"
import { bookType } from "../../../core/core-catalog"
import type { Book, Page } from "../../../core/schema/book"
import { findAll, replaceAll, replaceOne, type SearchHit, type SearchQuery } from "./find"
import type { SearchSpot } from "./state"

// 見せ方の探せる口（base が拡張ポイントに書き足す）: ページの探す原文と、原文 before を after にする page-update の fields
export interface SearchableDef {
  textOf(page: Page): string
  edit(page: Page, before: string, after: string): Readonly<Record<string, unknown>>
}

declare module "../../../core/catalog" {
  interface PresentationExtras {
    // ページの原文を探せる見せ方の口（無ければ、その見せ方のブックは探せない）
    search?: SearchableDef
  }
}

// ブック book が探せるなら、その見せ方の口（探せなければ none）
export function searchableOf(catalog: CoreCatalog, book: Book | null): SearchableDef | "none" {
  if (!book) return "none"
  const presentation = bookType(catalog, book.type).presentation
  return (presentation ? catalog.presentations.get(presentation)?.search : undefined) ?? "none"
}

// ブック book のページ（ページを持たなければ空）
export const pagesOf = (book: Book): readonly Page[] => ("pages" in book && Array.isArray(book.pages) ? book.pages : [])

// 探す範囲のページごとの当たり（page なら開いているページ opened だけ。正規表現が読めなければ bad-pattern）
export function hitsIn(
  searchable: SearchableDef,
  book: Book,
  query: SearchQuery,
  scope: "page" | "book",
  opened: string | null,
): { page: Page; hits: SearchHit[] }[] | "bad-pattern" {
  const pages = pagesOf(book).filter(p => scope === "book" || p.id === opened)
  const out: { page: Page; hits: SearchHit[] }[] = []
  for (const page of pages) {
    const found = findAll(searchable.textOf(page), query)
    if (found.kind === "bad-pattern") return "bad-pattern"
    out.push({ page, hits: found.hits })
  }
  return out
}

// 今の所 from（ページと原文の位置）から向き direction に進んだ次の当たり（無ければ none）。ページの並びの順にページをまたいで進み、
// 端を越えたら wrap なら反対の端から（ページが 1 つなら、そのページの中で回る）
export function stepHit(
  pages: readonly { page: Page; hits: readonly SearchHit[] }[],
  from: { page: string; at: number },
  direction: "forward" | "backward",
  wrap: boolean,
): SearchSpot | "none" {
  const here = pages.findIndex(p => p.page.id === from.page)
  const all = pages.flatMap((p, i) => p.hits.map(hit => ({ i, page: p.page.id, hit })))
  const ahead = (x: { i: number; hit: SearchHit }) =>
    direction === "forward"
      ? x.i > here || (x.i === here && x.hit.start >= from.at)
      : x.i < here || (x.i === here && x.hit.start < from.at)
  const inOrder = direction === "forward" ? all : [...all].reverse()
  const next = inOrder.find(ahead) ?? (wrap ? inOrder[0] : undefined)
  return next ? { page: next.page, start: next.hit.start, end: next.hit.end } : "none"
}

// 当たり spot を replacement に置き換える page-update の引数（もう当たりでなければ none）
export function replaceOneArgs(
  searchable: SearchableDef,
  page: Page,
  query: SearchQuery,
  spot: SearchSpot,
  replacement: string,
): { page: string; fields: Readonly<Record<string, unknown>> } | "none" {
  const before = searchable.textOf(page)
  const after = replaceOne(before, query, spot, replacement)
  return after === before ? "none" : { page: page.id, fields: searchable.edit(page, before, after) }
}

// ページ page の当たりを全部 replacement に置き換える page-update の引数（替わる物が無ければ none）
export function replaceAllArgs(
  searchable: SearchableDef,
  page: Page,
  query: SearchQuery,
  replacement: string,
): { page: string; fields: Readonly<Record<string, unknown>> } | "none" {
  const before = searchable.textOf(page)
  const after = replaceAll(before, query, replacement)
  return after === before ? "none" : { page: page.id, fields: searchable.edit(page, before, after) }
}
