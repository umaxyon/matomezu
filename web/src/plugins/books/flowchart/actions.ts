// フローチャートのアクションとコマンド: ページの形を流れに沿って並べ直す（自動で整列）。
// 開始の形・分岐の形は、タイプが選んだアイテムの中から決めたもの（flowchart.ts の START_ITEMS・BRANCH_ITEMS）。並べ方は align.ts の alignFlow で、流れの向きが右へなら縦と横を入れ替えて使う。
// 線でつながった形のまとまり（チャート）ごとに並べ、線を含めた広さで左右に並べて、紙の幅を超えたら折り返す。
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
import { extentOf, paperSize, placedAt, settingValue, unpinPage, withPage } from "../../base"
import { alignFlow, type FlowAlignOptions, type FlowItem } from "./align"
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

// 線でつながった形のまとまり（チャート）に分ける。並びは、入る線の無い開始の形を持つものが先、次に入る線の無い形を持つもの、
// 同じならページで先に置いた形を持つものが先。チャートの中の形はページの順
function chartsOf(page: ItemPage, ids: readonly string[]): string[][] {
  const links = connectorsOf(page).filter(c => ids.includes(c.from) && ids.includes(c.to))
  const root = new Map(ids.map(id => [id, id]))
  const find = (id: string): string => {
    const r = root.get(id) as string
    return r === id ? id : find(r)
  }
  for (const l of links) root.set(find(l.from), find(l.to))
  const items = new Map(shapesOf(page).map(s => [s.id, s.item]))
  const entered = new Set(links.filter(l => l.from !== l.to).map(l => l.to))
  const rank = (id: string) =>
    (entered.has(id) ? 2 : isStart(items.get(id) ?? "") ? 0 : 1) * ids.length + ids.indexOf(id)
  const groups = new Map<string, string[]>()
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id])
  return [...groups.values()].sort((a, b) => Math.min(...a.map(rank)) - Math.min(...b.map(rank)))
}

// ページの形を流れに沿って並べ直した形の四角（形ごと）。紙に収まらなければ null。
// 線でつながった形のまとまり（チャート）ごとに並べ、線を含めた外枠（base の extentOf）で測って、流れと交わる向き（下へなら横）に間隔を空けて並べる。
// 紙からはみ出すなら折り返して次の段へ。段の中のチャートは流れの始まりの側（下へなら上）をそろえ、段全体を紙の真ん中に置く。
// setting はそのページで効いている設定の値（線の通り方を測るのに使う）
export function alignedRects(
  catalog: CoreCatalog,
  page: ItemPage,
  dir: FlowDirection,
  setting: (id: string) => unknown,
): Map<string, Rect> | null {
  const paper = paperSize(catalog, page)
  if (!paper) return null
  const rects = rectsOf(catalog, page)
  const shapes = shapesOf(page).filter(s => rects.has(s.id))
  const item = new Map(
    shapes.map(s => {
      const r = turn(rects.get(s.id) as Rect, dir)
      return [s.id, { id: s.id, w: r.w, h: r.h, start: isStart(s.item), branch: isBranch(s.item) }]
    }),
  )
  const charts = chartsOf(
    page,
    shapes.map(s => s.id),
  )
  const room = turn({ x: 0, y: 0, ...paper }, dir)
  const width = room.w - ALIGN_MARGIN * 2
  for (const gap of GAPS) {
    // チャートごとの並べた形（流れが下へのときの四角）と、線を含めた外枠
    const laid = charts.map(ids => {
      const members = new Set(ids)
      const links = connectorsOf(page)
        .filter(c => members.has(c.from) && members.has(c.to))
        .map(c => ({ from: c.from, to: c.to }))
      const at = alignFlow(
        ids.map(id => item.get(id) as FlowItem),
        links,
        { centerX: 0, top: 0, ...gap },
      )
      const placed = new Map(
        ids.map(id => {
          const i = item.get(id) as FlowItem
          return [id, { ...(at.get(id) ?? { x: 0, y: 0 }), w: i.w, h: i.h }]
        }),
      )
      // そのチャートの形と線だけを並べた位置に置いたページで測る
      const real = new Map([...placed].map(([id, r]) => [id, turn(r, dir)]))
      const alone = unpinPage(catalog, {
        ...page,
        items: placedAt(catalog, page, real).filter(
          i => members.has(i.id) || ("from" in i && members.has(i.from) && members.has(i.to)),
        ),
      })
      const ext = extentOf(catalog, alone, setting)
      return { placed, ext: turn(ext ?? { x: 0, y: 0, w: 0, h: 0 }, dir) }
    })
    if (laid.some(c => c.ext.w > width)) continue
    // 段に分ける（隣に置くと紙の幅を超えるなら折り返す）
    const rows: (typeof laid)[] = []
    for (const c of laid) {
      const row = rows[rows.length - 1]
      const used = row ? row.reduce((w, o) => w + o.ext.w, 0) + row.length * gap.gapX : 0
      if (row && used + c.ext.w <= width) row.push(c)
      else rows.push([c])
    }
    const out = new Map<string, Rect>()
    let top = ALIGN_MARGIN
    for (const row of rows) {
      const total = row.reduce((w, o) => w + o.ext.w, 0) + (row.length - 1) * gap.gapX
      let left = Math.round((room.w - total) / 2)
      for (const c of row) {
        const dx = left - c.ext.x
        const dy = top - c.ext.y
        for (const [id, r] of c.placed) out.set(id, turn({ ...r, x: r.x + dx, y: r.y + dy }, dir))
        left += c.ext.w + gap.gapX
      }
      top += Math.max(...row.map(c => c.ext.h)) + gap.gapY
    }
    if (top - gap.gapY > room.h - ALIGN_MARGIN) continue
    return out
  }
  return null
}

export const PAGE_ALIGN = kit.defineAction({
  id: "page-align",
  aiDescription:
    "Arrange the shapes of a flowchart page along its lines: starting from a rounded or circle shape with no line coming in, the main path is lined up on the middle of the paper and branches go beside it (right first; for a book whose flow direction is right, the main path runs left to right and branches go below first). A line from one diamond to another puts the second diamond beside the first. Shapes not joined by lines make separate charts, placed side by side with their tops level (rows centered on the paper; for the flow direction right, one below another with their left ends level) and wrapped to a new row when the next one would not fit. Lines lose their fixed ends and hand-set routes. It is refused if the shapes do not fit on the paper even with smaller gaps.",
  title: "Auto align",
  target: "book",
  args: z.strictObject({ page: z.string().min(1) }),
  run: (subject, args, ctx) => {
    const book = pagedOf(subject)
    const page = book?.pages.find(p => p.id === args.page)
    if (!book || !page) return null
    const dir = settingValue(ctx.catalog, book, page, FLOW_DIRECTION.id) as FlowDirection
    const rects = alignedRects(ctx.catalog, page, dir, id => settingValue(ctx.catalog, book, page, id))
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

// 開いているページを自動で整列する（紙の右クリックのメニュー）。紙に収まらなければ何も変えず、注意のトーストで知らせる
export const PAGE_ALIGN_COMMAND = kit.defineCommand({
  id: "page-align",
  performs: [PAGE_ALIGN.id],
  title: "Auto align",
  run: (ctx, a) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const done = a.perform(PAGE_ALIGN.id, { page: opened.page }, { book: opened.book })
    if (!done.ok) a.showToast({ kind: "warn", message: kit.message("Does not fit on the paper") })
  },
  when: onPage,
})
