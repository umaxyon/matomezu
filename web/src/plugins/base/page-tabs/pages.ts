// 次のページ（と、あとで変えるページ）に選べる紙と向き、可変ページにできるかと、次のページの題名の案（ページを足す・消すのは土台の core/book.ts）

import { findBinder, findPage, lineupOf, pagesIn, putPage } from "../../../core/book"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { type GrowChoice, ORIENTATIONS, type Orientation } from "../../../core/def/paper"
import type { MessageKey, Params } from "../../../core/i18n/i18n"
import type { PaperChoice, PaperRule } from "../../../core/paper"
import type { Book, Page } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { setField } from "../fields"
import { kit } from "../kit"
import { growKindOf } from "../place/grow"
import { extentOf, growOf, paddedFor, pageArea } from "../place/items"

// タイプ type のページの、紙の規定
const paperRule = (catalog: CoreCatalog, type: string): PaperRule => pageType(catalog, type).paper

// 次のページに選べる紙と向き。バインダの中では、最初のページの紙と向きだけ
export interface PaperOptions {
  papers: readonly string[]
  orientations: readonly Orientation[]
}

// 規定 rule の下で、次のページに選べる紙と向き（mates は、紙と向きをそろえる相手のページ。いなければ規定から選ぶ）
export function choosablePapers(rule: PaperRule, mates: readonly Page[]): PaperOptions {
  const first = mates[0]
  if (!first) return { papers: rule.allowed, orientations: ORIENTATIONS }
  return { papers: [first.paper], orientations: [first.orientation] }
}

// 足すページを入れる所: ブックの並び（lineup）、今あるバインダ（その id）、これから作るバインダ（new-binder）
export type PaperPlace = "lineup" | "new-binder" | { binder: string }

// 紙と向きをそろえる相手: 同じバインダの中のページ（バインダの外のページと、これから作るバインダには、相手がいない）
function mates(book: Book, place: PaperPlace): readonly Page[] {
  return typeof place === "string" ? [] : pagesIn(book, place.binder)
}

// ブック book の所 place に足す、タイプ type の次のページに選べる紙と向き
export function paperChoices(
  catalog: CoreCatalog,
  book: Book,
  type: string,
  place: PaperPlace = "lineup",
): PaperOptions {
  return choosablePapers(paperRule(catalog, type), mates(book, place))
}

// タイプ type のページに、そろえる相手を見ずに選べる紙と向き（タイプの規定）
export const typePaperChoices = (catalog: CoreCatalog, type: string): PaperOptions =>
  choosablePapers(paperRule(catalog, type), [])

// ページ page の紙と向きを変えるときに選べるもの（そのページ自身は、そろえる相手にしない）
export function paperChoicesFor(catalog: CoreCatalog, book: Book, page: Page): PaperOptions {
  const binder = findPage(book, page.id)?.binder
  return choosablePapers(
    paperRule(catalog, page.type),
    mates(book, binder ? { binder: binder.id } : "lineup").filter(p => p.id !== page.id),
  )
}

// バインダ binder（id）のページの紙と向きを、まとめて choice にできるか: choice が、バインダに入るタイプの規定の紙と向きのとき
export function canPaperBinder(catalog: CoreCatalog, book: Book, binder: string, choice: PaperChoice): boolean {
  const type = findBinder(book, binder)?.pageType
  if (type === undefined) return false
  return canChoose({ papers: paperRule(catalog, type).allowed, orientations: ORIENTATIONS }, choice)
}

// タイプ type のページを、可変ページにする・やめるを選べるか（いつも可変ページのタイプは選べない）
export function canGrow(catalog: CoreCatalog, type: string): boolean {
  const kind = growKindOf(pageType(catalog, type).grow)
  return kind !== "none" && kind !== "always"
}

// タイプ type で利用者が選べる増やす向き（最初のものが既定）。タイプが決めるなら空
export function growChoices(catalog: CoreCatalog, type: string): readonly GrowChoice[] {
  const kind = growKindOf(pageType(catalog, type).grow)
  return typeof kind === "string" ? [] : kind
}

// 可変ページにするか（true・false）か、選んだ増やす向き grows を、タイプ type のページの grows の値にしたもの。作れない・選べない向きなら null。
// 向きを選べるタイプで true なら既定の向き。false なら undefined（可変ページでない）
export function growsValue(catalog: CoreCatalog, type: string, grows: boolean | GrowChoice): Page["grows"] | null {
  if (grows === false) return undefined
  if (!canGrow(catalog, type)) return null
  const choices = growChoices(catalog, type)
  if (grows === true) return choices[0] ?? true
  return choices.includes(grows) ? grows : null
}

// ページ page の grows を grows（ページの grows の値）にしたもの（中身は、ノーマライズステップ variable-pages.ts が増やす向きに合わせてずらす）
export const withGrows = <P extends Page>(page: P, grows: Page["grows"]): P =>
  setField(page, ["orientation"], "grows", grows)

// アクションのあとのブック after のページ page を、増やす向きに合わせて整えたもの: 左・上へ増やすなら空きの印刷区画を持たせ、前のブック before では
// 増やしていたが増やさなくなった向きは空きを詰める（中身を印刷区画の単位でずらし、ページの shift に足す）。紙・向き・可変ページかを変えたか、
// 中身をずらしたページの形が、増やさない向きで紙からはみ出すなら null（ノーマライズステップ variable-pages.ts と、ページの設定のダイアログが使う）
export function normalizedPage(catalog: CoreCatalog, before: Book, after: Book, page: Page): Page | null {
  const prev = findPage(before, page.id)?.page
  const was = prev && growOf(catalog, prev)
  const padded = paddedFor(catalog, page, growOf(catalog, page), was)
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

// ブック book の所 place に足す、タイプ type の次のページの紙の既定（規定の既定を選べなければ、選べるものの最初）
export function defaultPaper(
  catalog: CoreCatalog,
  book: Book,
  type: string,
  place: PaperPlace = "lineup",
): PaperChoice {
  const rule = paperRule(catalog, type)
  const { papers, orientations } = paperChoices(catalog, book, type, place)
  return {
    paper: papers.includes(rule.default) ? rule.default : (papers[0] ?? rule.default),
    orientation: orientations.includes(rule.orientation) ? rule.orientation : (orientations[0] ?? rule.orientation),
  }
}

// 次のページの題名の案（t は見た目の t()。今の言語で引く）。同じブックかバインダの名前 taken（省けば、ブックの並び）と重ならない番号にする
export function nextPageTitle(
  book: Book,
  t: (key: MessageKey, params?: Params) => string,
  taken: readonly string[] = lineupOf(book).map(e => e.title),
): string {
  for (let n = taken.length + 1; ; n++) {
    const title = t(kit.message("Page {n}"), { n })
    if (!taken.includes(title)) return title
  }
}

// ブック book のページ page の形が、ページの広さに収まるか（可変ページは伸びる向きには印刷区画を増やして広がるので、伸びない向きだけ紙 1 枚に収める）
export function shapesFit(catalog: CoreCatalog, book: Book, page: string): boolean {
  const found = findPage(book, page)?.page
  if (!found) return true
  const area = pageArea(catalog, found)?.size
  const extent = extentOf(catalog, found, settingsAt(catalog, found))
  return (
    !extent ||
    (!!area && extent.x >= 0 && extent.y >= 0 && extent.x + extent.w <= area.w && extent.y + extent.h <= area.h)
  )
}
