// フローチャートのアクションとコマンド: ページの形を流れに沿って並べ直す（自動で整列）。
// 開始の形・分岐の形は、タイプが選んだアイテムの中から決めたもの（flowchart.ts の START_ITEMS・BRANCH_ITEMS）。並べ方は align.ts の alignFlow で、流れの向きが右へなら縦と横を入れ替えて使う。
// 並べ直したら線の端の固定と手直しを外す（つなぐものの定義の unpin）。紙に収まらなければ間隔を詰めて試し、それでも収まらなければ断る
import { z } from "zod"
import {
  type CommandContext,
  type CoreCatalog,
  connectorsOf,
  type ItemPage,
  type PagedBook,
  pagedOf,
  type Rect,
  rectsOf,
  shapesOf,
} from "../../../plugin-api"
import { paperSize, placedAt, settingValue, unpinPage, withPage } from "../../base"
import { alignFlow, type FlowAlignOptions } from "./align"
import { FLOW_DIRECTION, type FlowDirection, isBranch, isStart } from "./flowchart"
import { kit } from "./kit"

// 間隔（線のキャプション Yes / No が入るくらい）。収まらなければ次の詰めた間隔で試す
const GAPS: readonly Omit<FlowAlignOptions, "centerX" | "top">[] = [
  { gapX: 60, gapY: 48, sideDrop: 24 },
  { gapX: 40, gapY: 40, sideDrop: 20 },
]
// 並べた形と紙の端の間
export const ALIGN_MARGIN = 16

// 流れの向き dir の四角を、下へのときの四角にする（右へなら縦と横を入れ替える。同じ関数で戻せる）
const turn = (r: Rect, dir: FlowDirection): Rect => (dir === "down" ? r : { x: r.y, y: r.x, w: r.h, h: r.w })

// ページの形を流れに沿って並べ直した形の四角（形ごと）。紙に収まらなければ null
export function alignedRects(catalog: CoreCatalog, page: ItemPage, dir: FlowDirection): Map<string, Rect> | null {
  const paper = paperSize(catalog, page)
  if (!paper) return null
  const rects = rectsOf(catalog, page)
  const shapes = shapesOf(page).filter(s => rects.has(s.id))
  const items = shapes.map(s => {
    const r = turn(rects.get(s.id) as Rect, dir)
    return { id: s.id, w: r.w, h: r.h, start: isStart(s.item), branch: isBranch(s.item) }
  })
  const links = connectorsOf(page).map(c => ({ from: c.from, to: c.to }))
  const room = turn({ x: 0, y: 0, ...paper }, dir)
  for (const gap of GAPS) {
    const at = alignFlow(items, links, { centerX: 0, top: 0, ...gap })
    const placed = items.map(i => ({ ...i, ...(at.get(i.id) ?? { x: 0, y: 0 }) }))
    const left = Math.min(...placed.map(p => p.x))
    const right = Math.max(...placed.map(p => p.x + p.w))
    const bottom = Math.max(...placed.map(p => p.y + p.h))
    if (right - left > room.w - ALIGN_MARGIN * 2 || bottom > room.h - ALIGN_MARGIN * 2) continue
    // 横は紙の真ん中、縦は紙の上の端から
    const dx = Math.round((room.w - (right - left)) / 2) - left
    return new Map(placed.map(p => [p.id, turn({ x: p.x + dx, y: p.y + ALIGN_MARGIN, w: p.w, h: p.h }, dir)]))
  }
  return null
}

export const PAGE_ALIGN = kit.defineAction({
  id: "page-align",
  aiDescription:
    "Arrange the shapes of a flowchart page along its lines: starting from a rounded or circle shape with no line coming in, the main path is lined up on the middle of the paper and branches go beside it (right first; for a book whose flow direction is right, the main path runs left to right and branches go below first). A line from one diamond to another puts the second diamond beside the first. Lines lose their fixed ends and hand-set routes. It is refused if the shapes do not fit on the paper even with smaller gaps.",
  title: "Auto align",
  target: "book",
  args: z.strictObject({ page: z.string().min(1) }),
  run: (subject, args, ctx) => {
    const book = pagedOf(subject)
    const page = book?.pages.find(p => p.id === args.page)
    if (!book || !page) return null
    const dir = settingValue(ctx.catalog, book, page, FLOW_DIRECTION.id) as FlowDirection
    const rects = alignedRects(ctx.catalog, page, dir)
    if (!rects) return null
    const next: PagedBook = withPage(
      ctx.catalog,
      book,
      unpinPage(ctx.catalog, { ...page, items: placedAt(ctx.catalog, page, rects) }),
    )
    return { next, result: {} }
  },
})

const onPage = (ctx: CommandContext) => pagedOf(ctx.book) !== undefined && ctx.stage.opened?.page != null

// 開いているページを自動で整列する（紙の右クリックのメニュー）。紙に収まらなければ何も変えない
export const PAGE_ALIGN_COMMAND = kit.defineCommand({
  id: "page-align",
  performs: [PAGE_ALIGN.id],
  title: "Auto align",
  run: (ctx, a) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    a.perform(PAGE_ALIGN.id, { page: opened.page }, { book: opened.book })
  },
  when: onPage,
})
