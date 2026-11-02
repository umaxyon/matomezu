// 次のページ（と、あとで変えるページ）に選べる紙と向き、可変ページにできるかと、次のページの題名の案（ページを足す・消すのは土台の core/book.ts）

import { hasPages, type PagedBook, putPage } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { type GrowChoice, ORIENTATIONS, type Orientation } from "../../../core/def/paper"
import { fail } from "../../../core/errors"
import { type Lang, translate } from "../../../core/i18n/i18n"
import type { PaperChoice, PaperRule } from "../../../core/paper"
import type { Book, Page } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { setField } from "../fields"
import { kit } from "../kit"
import { extentOf, growOf, paddedFor, pageArea } from "../place/items"

function pagesRule(catalog: CoreCatalog, book: PagedBook) {
  const rule = bookType(catalog, book.type).pages
  if (!rule) return fail("E103", { type: book.type })
  return rule
}

// 次のページに選べる紙と向き。1 冊の紙をそろえる規定では、最初のページの紙と向きだけ
export interface PaperOptions {
  papers: readonly string[]
  orientations: readonly Orientation[]
}

// 規定の下で、次のページに選べる紙と向き
export function choosablePapers(rule: PaperRule, pages: readonly Page[]): PaperOptions {
  const first = pages[0]
  if (rule.perPage || !first) return { papers: rule.allowed, orientations: ORIENTATIONS }
  return { papers: [first.paper], orientations: [first.orientation] }
}

export function paperChoices(catalog: CoreCatalog, book: PagedBook): PaperOptions {
  return choosablePapers(pagesRule(catalog, book).paper, book.pages)
}

// ページ page の紙と向きを変えるときに選べるもの（そのページ自身は、1 冊の紙をそろえる規定の手本にしない）
export function paperChoicesFor(catalog: CoreCatalog, book: PagedBook, page: string): PaperOptions {
  return choosablePapers(
    pagesRule(catalog, book).paper,
    book.pages.filter(p => p.id !== page),
  )
}

// ブックのタイプが可変ページを作れるか
export const canGrow = (catalog: CoreCatalog, book: PagedBook): boolean =>
  pagesRule(catalog, book) !== undefined && bookType(catalog, book.type).grow !== undefined

// ブックのタイプで利用者が選べる増やす向き（最初のものが既定）。タイプが決めるなら空
export function growChoices(catalog: CoreCatalog, book: PagedBook): readonly GrowChoice[] {
  const rule = bookType(catalog, book.type).grow
  return rule && "choices" in rule ? rule.choices : []
}

// 可変ページにするか（true・false）か、選んだ増やす向き grows を、ページの grows の値にしたもの。作れない・選べない向きなら null。
// 向きを選べるタイプで true なら既定の向き。false なら undefined（可変ページでない）
export function growsValue(catalog: CoreCatalog, book: PagedBook, grows: boolean | GrowChoice): Page["grows"] | null {
  if (grows === false) return undefined
  if (!canGrow(catalog, book)) return null
  const choices = growChoices(catalog, book)
  if (grows === true) return choices[0] ?? true
  return choices.includes(grows) ? grows : null
}

// ページ page の grows を grows（ページの grows の値）にしたもの（中身は、ノーマライズステップ variable-pages.ts が増やす向きに合わせてずらす）
export const withGrows = <P extends Page>(page: P, grows: Page["grows"]): P =>
  setField(page, ["orientation"], "grows", grows)

// アクションのあとのブック after のページ page を、増やす向きに合わせて整えたもの: 左・上へ増やすなら空きの印刷区画を持たせ、前のブック before では
// 増やしていたが増やさなくなった向きは空きを詰める（中身を印刷区画の単位でずらし、ページの shift に足す）。紙・向き・可変ページかを変えたか、
// 中身をずらしたページの形が、増やさない向きで紙からはみ出すなら null（ノーマライズステップ variable-pages.ts と、ページの設定のダイアログが使う）
export function normalizedPage(catalog: CoreCatalog, before: Book, after: PagedBook, page: Page): Page | null {
  const prev = hasPages(before) ? before.pages.find(p => p.id === page.id) : undefined
  const was = prev && growOf(catalog, before, prev)
  const padded = paddedFor(catalog, page, growOf(catalog, after, page), was)
  const papered =
    prev !== undefined &&
    (prev.paper !== page.paper || prev.orientation !== page.orientation || prev.grows !== page.grows)
  if (padded === page && !papered) return page
  return shapesFit(catalog, padded === page ? after : putPage(after, padded), page.id) ? padded : null
}

// 選べるものに入るか
export function canChoose(options: PaperOptions, choice: PaperChoice): boolean {
  return options.papers.includes(choice.paper) && options.orientations.includes(choice.orientation)
}

// 次のページの紙の既定（規定の既定を選べなければ、選べるものの最初）
export function defaultPaper(catalog: CoreCatalog, book: PagedBook): PaperChoice {
  const rule = pagesRule(catalog, book).paper
  const { papers, orientations } = paperChoices(catalog, book)
  return {
    paper: papers.includes(rule.default) ? rule.default : (papers[0] ?? rule.default),
    orientation: orientations.includes(rule.orientation) ? rule.orientation : (orientations[0] ?? rule.orientation),
  }
}

// 次のページの題名の案
export function nextPageTitle(catalog: CoreCatalog, book: PagedBook, lang: Lang): string {
  return translate(catalog.messages, lang, kit.message("Page {n}"), { n: book.pages.length + 1 })
}

// ブック book のページ page の形が、ページの広さに収まるか（可変ページは伸びる向きには印刷区画を増やして広がるので、伸びない向きだけ紙 1 枚に収める）
export function shapesFit(catalog: CoreCatalog, book: PagedBook, page: string): boolean {
  const found = book.pages.find(p => p.id === page)
  if (!found) return true
  const area = pageArea(catalog, book, found)?.size
  const extent = extentOf(catalog, found, settingsAt(catalog, book, found))
  return (
    !extent ||
    (!!area && extent.x >= 0 && extent.y >= 0 && extent.x + extent.w <= area.w && extent.y + extent.h <= area.h)
  )
}
