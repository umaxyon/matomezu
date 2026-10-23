// 線のコマンド: 形の〇から引いて離したときに線を引く（図面のビューから呼ぶ）
import type { Point } from "../../../../core/geom"
import { toPaper } from "../../../../core/stage"
import { type CommandContext, defineCommand } from "../../../../store/commands/def"
import { rectsOf } from "../items/items"
import { drawnLineProps } from "./connect"
import { DEFAULT_ROUTE } from "./placed"
import type { Side } from "./route"

const onDrawingPage = (ctx: CommandContext) => ctx.book?.type === "drawing" && ctx.stage.opened?.page != null

// 形 from の side の辺の〇から引き、形 to の上の at（表示領域の左上からの画面の座標）で離したときに線を引く（connect.ts の drawnLineProps の端と矢印）。
// 引けない相手なら何もしない
export const LINE_DRAW = defineCommand({
  id: "line.draw",
  title: "Connect items",
  run: (ctx, a, args: { from: string; side: Side; to: string; at: Point }) => {
    const { opened } = ctx.stage
    const book = ctx.book?.type === "drawing" ? ctx.book : null
    const page = book?.pages.find(p => p.id === opened?.page)
    const drop = toPaper(ctx.stage, args.at)
    if (!opened || !page || !drop) return
    const rects = rectsOf(ctx.registry, page)
    const props = drawnLineProps(page, rects, DEFAULT_ROUTE === "elbow", args.from, args.side, args.to, [
      drop.x,
      drop.y,
    ])
    if (props) a.perform("line.connect", { page: page.id, from: args.from, to: args.to, props }, { book: opened.book })
  },
  when: onDrawingPage,
})
