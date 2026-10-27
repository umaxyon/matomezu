// 線のコマンド: 形の〇から引いて離したときに線を引く（線の層から呼ぶ）、線の編集のダイアログを開く（線のダブルクリックと右クリックのメニュー）、線の端をほかの形の上で離したときにつなぎ替える

import { type CommandContext, type Point, pagedOf, portAreasOf, toPaper } from "../../../plugin-api"
import { LINE_CONNECT, LINE_RECONNECT, LINE_UPDATE } from "./actions"
import { drawnLineProps, loopEndsNear, nearestEnd } from "./connect"
import { kit } from "./kit"
import { elbowAt, LINE_EDIT_DIALOG } from "./line"
import { linesOf } from "./placed"
import type { Side } from "./route"

const onItemPage = (ctx: CommandContext) => pagedOf(ctx.book) !== undefined && ctx.stage.opened?.page != null

// 形 from の side の辺の〇から引き、形 to の上の at（表示領域の左上からの画面の座標）で離したときに線を引く（connect.ts の drawnLineProps の端と矢印）。
// 引けない相手なら何もしない
export const LINE_DRAW = kit.defineCommand({
  id: "line-draw",
  performs: [LINE_CONNECT.id],
  title: "Connect items",
  run: (ctx, a, args: { from: string; side: Side; to: string; at: Point }) => {
    const { opened } = ctx.stage
    const book = pagedOf(ctx.book) ?? null
    const page = book?.pages.find(p => p.id === opened?.page)
    const drop = toPaper(ctx.stage, args.at)
    if (!opened || !book || !page || !drop) return
    const rects = portAreasOf(ctx.catalog, page)
    const props = drawnLineProps(page, rects, elbowAt(ctx.catalog, book, page), args.from, args.side, args.to, drop)
    if (props) a.perform(LINE_CONNECT.id, { page: page.id, from: args.from, to: args.to, props }, { book: opened.book })
  },
  when: onItemPage,
})

// 線の編集のダイアログを開く。右クリックのメニューでは「設定」として出す
export const LINE_EDIT = kit.defineCommand({
  id: "line-edit",
  performs: [LINE_UPDATE.id],
  title: "Settings",
  run: (ctx, a, { item }: { item: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, LINE_EDIT_DIALOG.id, { page, item })
  },
  when: onItemPage,
})

// 線 line の端 end（始点 from か終点 to）を運んで、形 item の上の at（表示領域の左上からの画面の座標）で離したときに、つなぎ替える（アクション line-reconnect）。
// つなぎ替えた端は、離した所に一番近いふちの点に固定する。自分に戻る線になるなら、離した所に近い角が自動の角と違って空いていればその角に固定する
export const LINE_RECONNECT_DROP = kit.defineCommand({
  id: "line-drop",
  performs: [LINE_RECONNECT.id],
  title: "Reconnect line",
  run: (ctx, a, args: { line: string; end: "from" | "to"; item: string; at: Point }) => {
    const { opened } = ctx.stage
    const book = pagedOf(ctx.book) ?? null
    const page = book?.pages.find(p => p.id === opened?.page)
    const line = page && linesOf(page).find(l => l.id === args.line)
    const drop = toPaper(ctx.stage, args.at)
    if (!opened || !book || !page || !line || !drop) return
    const rects = portAreasOf(ctx.catalog, page)
    const to = rects.get(args.item)
    const other = args.end === "from" ? line.to : line.from
    if (!to) return
    const props =
      args.item === other
        ? (loopEndsNear(page, rects, elbowAt(ctx.catalog, book, page), args.item, drop, line.id) ?? undefined)
        : { [args.end === "from" ? "exitAt" : "enterAt"]: nearestEnd(to, drop) }
    a.perform(
      LINE_RECONNECT.id,
      { page: page.id, line: line.id, end: args.end, item: args.item, ...(props ? { props } : {}) },
      { book: opened.book },
    )
  },
  when: onItemPage,
})
