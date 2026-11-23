// 次のページ（と、あとで変えるページ）に選べる紙と向きと、次のページの題名の案（可変ページにできるか・増やす向きの選び方は place/grow.ts）（ページを足す・消すのは土台の core/book.ts）

import { findBinder, findPage, lineupOf, NO_BINDER, NO_PAGE, pagesIn } from "../../../core/book"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { ORIENTATIONS, type Orientation } from "../../../core/def/paper"
import type { MessageKey, Params } from "../../../core/i18n/i18n"
import type { PaperChoice, PaperRule } from "../../../core/paper"
import type { ItemPage } from "../../../core/placed"
import type { Page, StageLineup } from "../../../core/schema/book"
import { settingsAt } from "../book-settings"
import { kit } from "../kit"
import { extentOf, growOf, paddedFor, pageArea } from "../place/grow"

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
function mates(book: StageLineup, place: PaperPlace): readonly Page[] {
  return typeof place === "string" ? [] : pagesIn(book, place.binder)
}

// ブック book の所 place に足す、タイプ type の次のページに選べる紙と向き
export function paperChoices(
  catalog: CoreCatalog,
  book: StageLineup,
  type: string,
  place: PaperPlace = "lineup",
): PaperOptions {
  return choosablePapers(paperRule(catalog, type), mates(book, place))
}

// タイプ type のページに、そろえる相手を見ずに選べる紙と向き（タイプの規定）
export const typePaperChoices = (catalog: CoreCatalog, type: string): PaperOptions =>
  choosablePapers(paperRule(catalog, type), [])

// ページ page の紙と向きを変えるときに選べるもの（そのページ自身は、そろえる相手にしない）
export function paperChoicesFor(catalog: CoreCatalog, book: StageLineup, page: Page): PaperOptions {
  const at = findPage(book, page.id)
  const binder = at === NO_PAGE ? NO_BINDER : at.binder
  return choosablePapers(
    paperRule(catalog, page.type),
    mates(book, binder !== NO_BINDER ? { binder: binder.id } : "lineup").filter(p => p.id !== page.id),
  )
}

// バインダ binder（id）のページの紙と向きを、まとめて choice にできるか: choice が、バインダに入るタイプの規定の紙と向きのとき
export function canPaperBinder(catalog: CoreCatalog, book: StageLineup, binder: string, choice: PaperChoice): boolean {
  const type = findBinder(book, binder)?.pageType
  if (type === undefined) return false
  return canChoose({ papers: paperRule(catalog, type).allowed, orientations: ORIENTATIONS }, choice)
}

// アクションのあとのページ page を、増やす向きに合わせて整えたもの: 左・上へ増やすなら空きの印刷区画を持たせ、アクションの前のページ before では
// 増やしていたが増やさなくなった向きは空きを詰める（中身を印刷区画の単位でずらし、ページの shift に足す。作ったページなら before は undefined）。
// 紙・向き・可変ページかを変えたか、中身をずらしたページの形が、増やさない向きで紙からはみ出すなら null（ノーマライズステップ variable-pages.ts と、ページの設定のダイアログが使う）
export function normalizedPage<P extends ItemPage>(
  catalog: CoreCatalog,
  before: ItemPage | undefined,
  page: P,
): P | null {
  const was = before && growOf(catalog, before)
  const padded = paddedFor(catalog, page, growOf(catalog, page), was)
  const papered =
    before !== undefined &&
    (before.paper !== page.paper || before.orientation !== page.orientation || before.grows !== page.grows)
  if (padded === page && !papered) return page
  return shapesFit(catalog, padded) ? padded : null
}

// 選べるものに入るか
export function canChoose(options: PaperOptions, choice: PaperChoice): boolean {
  return options.papers.includes(choice.paper) && options.orientations.includes(choice.orientation)
}

// ブック book の所 place に足す、タイプ type の次のページの紙の既定（規定の既定を選べなければ、選べるものの最初）
export function defaultPaper(
  catalog: CoreCatalog,
  book: StageLineup,
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

// ページの題名の案（t は見た目の t()。今の言語で引く）: 番号 from から数えて、名前 taken と重ならない最初の番号
export function freePageTitle(
  t: (key: MessageKey, params?: Params) => string,
  taken: readonly string[],
  from = 1,
): string {
  for (let n = from; ; n++) {
    const title = t(kit.message("Page {n}"), { n })
    if (!taken.includes(title)) return title
  }
}

// 次のページの題名の案。同じブックかバインダの名前 taken（省けば、ブックの並び）の数の次から数える
export const nextPageTitle = (
  book: StageLineup,
  t: (key: MessageKey, params?: Params) => string,
  taken: readonly string[] = lineupOf(book).map(e => e.title),
): string => freePageTitle(t, taken, taken.length + 1)

// ページ page の形が、ページの広さに収まるか（可変ページは伸びる向きには印刷区画を増やして広がるので、伸びない向きだけ紙 1 枚に収める）
export function shapesFit(catalog: CoreCatalog, page: ItemPage): boolean {
  const area = pageArea(catalog, page).size
  const extent = extentOf(catalog, page, settingsAt(catalog, page))
  return !extent || (extent.x >= 0 && extent.y >= 0 && extent.x + extent.w <= area.w && extent.y + extent.h <= area.h)
}
