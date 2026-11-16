import { findPage, pagesOf } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import { pageType } from "../../../core/core-catalog"
import type { Book, Page } from "../../../core/schema/book"
import { findAll, replaceAll, replaceOne, type SearchHit, type SearchQuery } from "./find"
import type { SearchOpen, SearchSpot } from "./state"

// 見せ方のフィールド search の値（base が拡張ポイントに書き足す）: ページの探す原文と、原文 before を after にする page-update の fields
export interface SearchableDef {
  textOf(page: Page): string
  edit(page: Page, before: string, after: string): Readonly<Record<string, unknown>>
}

declare module "../../../core/catalog" {
  interface PresentationExtras {
    // ページの原文を探せる見せ方の、探し方と替え方（無ければ、その見せ方のページは探せない）
    search?: SearchableDef
  }
}

// ページ page が探せるなら、そのタイプの見せ方の search（探せなければ none）
export function searchableOf(
  catalog: CoreCatalog,
  page: Pick<Page, "type"> | null | undefined,
): SearchableDef | "none" {
  if (!page) return "none"
  const presentation = pageType(catalog, page.type).presentation
  return (presentation ? catalog.presentations.get(presentation)?.search : undefined) ?? "none"
}

// 探す範囲のページごとの当たり（page なら開いているページ opened だけ。正規表現が読めなければ bad-pattern）
export function hitsIn(
  catalog: CoreCatalog,
  book: Book,
  query: SearchQuery,
  scope: "page" | "book",
  opened: string | null,
): { page: Page; hits: SearchHit[] }[] | "bad-pattern" {
  const pages = pagesOf(book).filter(p => scope === "book" || p.id === opened)
  const out: { page: Page; hits: SearchHit[] }[] = []
  for (const page of pages) {
    const searchable = searchableOf(catalog, page)
    if (searchable === "none") continue // 探せないタイプのページは飛ばす
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

// ページ page の当たりを全部 replacement に置き換える page-update の引数（替わる物が無ければ none）
export function replaceAllArgs(
  catalog: CoreCatalog,
  page: Page,
  query: SearchQuery,
  replacement: string,
): { page: string; fields: Readonly<Record<string, unknown>> } | "none" {
  const searchable = searchableOf(catalog, page)
  if (searchable === "none") return "none"
  const before = searchable.textOf(page)
  const after = replaceAll(before, query, replacement)
  return after === before ? "none" : { page: page.id, fields: searchable.edit(page, before, after) }
}

// 探す字や切り替えを変えたあとの今の当たり: 今の当たりの頭（無ければ開いているページ opened の頭）から先の最初の当たり（端からも探す。無ければ none）
export function firstHitFrom(
  pages: readonly { page: Page; hits: readonly SearchHit[] }[],
  current: SearchSpot | "none",
  opened: string,
): SearchSpot | "none" {
  const from = current === "none" ? { page: opened, at: 0 } : { page: current.page, at: current.start }
  return stepHit(pages, from, "forward", true)
}

type PageHits = { page: Page; hits: readonly SearchHit[] }

// 当たりの並び pages の中に、spot と同じ当たりがあるか
const isHit = (pages: readonly PageHits[], spot: SearchSpot): boolean =>
  pages.some(p => p.page.id === spot.page && p.hits.some(h => h.start === spot.start && h.end === spot.end))

// 今の当たり current が、まだ当たりならそのまま（原文が変わって当たりでなくなっていれば none）
export const liveCurrent = (pages: readonly PageHits[], current: SearchSpot | "none"): SearchSpot | "none" =>
  current !== "none" && isHit(pages, current) ? current : "none"

// 検索ダイアログに出す数: 当たりの数と今の当たりの番号（1 から。無ければ 0）、ブック全体なら今の当たりのページの番号（1 から。無ければ 0）とページの数
export type SearchCount =
  | { kind: "bad-pattern" }
  | { kind: "count"; at: number; all: number; pages: { at: number; all: number } | "none" }

export function searchCount(catalog: CoreCatalog, book: Book, search: SearchOpen, opened: string | null): SearchCount {
  const pages = hitsIn(catalog, book, search.query, search.scope, opened)
  if (pages === "bad-pattern") return { kind: "bad-pattern" }
  const all = pages.flatMap(p => p.hits.map(h => ({ page: p.page.id, start: h.start })))
  const cur = liveCurrent(pages, search.current)
  const at = cur === "none" ? 0 : all.findIndex(h => h.page === cur.page && h.start === cur.start) + 1
  const page = cur === "none" ? 0 : pages.findIndex(p => p.page.id === cur.page) + 1
  return {
    kind: "count",
    at,
    all: all.length,
    pages: search.scope === "book" ? { at: page, all: pages.length } : "none",
  }
}

// 検索 search を change で変えた物。探す字・切り替え・範囲が変われば、今の当たりを、今の当たりの頭から先の最初の当たりに選び直す
export function changedSearch(
  catalog: CoreCatalog,
  book: Book,
  search: SearchOpen,
  change: Partial<SearchOpen>,
  opened: string | null,
): SearchOpen {
  const next = { ...search, ...change }
  const requery = change.query !== undefined || (change.scope !== undefined && change.scope !== search.scope)
  if (!requery) return next
  const pages = hitsIn(catalog, book, next.query, next.scope, opened)
  return { ...next, current: pages === "bad-pattern" ? "none" : firstHitFrom(pages, search.current, opened ?? "") }
}

// 今の当たりを置き換える: page-update の引数と、置き換えたあとの次の当たり（置き換えた字の後ろから先。置き換えた字の中は探さない）。
// 今の当たりが無いか、もう当たりでなければ、置き換えずに次の当たりへ移る（args が none）
export function replaceOneStep(
  catalog: CoreCatalog,
  book: Book,
  search: SearchOpen,
  opened: string | null,
): { args: { page: string; fields: Readonly<Record<string, unknown>> } | "none"; next: SearchSpot | "none" } {
  const pages = hitsIn(catalog, book, search.query, search.scope, opened)
  if (pages === "bad-pattern") return { args: "none", next: "none" }
  const cur = liveCurrent(pages, search.current)
  const page = cur === "none" ? undefined : findPage(book, cur.page)?.page
  const searchable = searchableOf(catalog, page)
  if (cur === "none" || !page || searchable === "none") {
    const from =
      search.current === "none"
        ? { page: opened ?? "", at: 0 }
        : { page: search.current.page, at: search.current.start }
    return { args: "none", next: stepHit(pages, from, "forward", search.wrap) }
  }
  const before = searchable.textOf(page)
  const after = replaceOne(before, search.query, cur, search.replacement)
  if (after === before)
    return { args: "none", next: stepHit(pages, { page: cur.page, at: cur.end }, "forward", search.wrap) }
  const found = findAll(after, search.query)
  const replaced = pages.map(p =>
    p.page.id === page.id ? { page: p.page, hits: found.kind === "hits" ? found.hits : [] } : p,
  )
  const end = cur.end + after.length - before.length
  return {
    args: { page: page.id, fields: searchable.edit(page, before, after) },
    next: stepHit(replaced, { page: page.id, at: end }, "forward", search.wrap),
  }
}
