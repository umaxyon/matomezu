// 図面の画面から置く・動かすコマンド。画面の座標を受け取り、紙の上の座標に直してアクションを呼ぶ
import type { Point } from "../../../../core/geom"
import { paperOf, toPaper, toPaperDelta } from "../../../../core/stage"
import { type CommandContext, defineCommand } from "../../../../store/commands/def"
import { BOX } from "../box"
import { fitsPaper, itemSize, PLACE_OFFSET } from "./items"

const onDrawingPage = (ctx: CommandContext) => ctx.book?.type === "drawing" && ctx.stage.opened?.page != null

// 置こうとしているアイテムの左上（紙の上）。ポインタ（表示領域の左上から）を PLACE_OFFSET だけ戻した所
export function placeAt(ctx: Pick<CommandContext, "stage">, pointer: Point): Point | null {
  return toPaper(ctx.stage, { x: pointer.x - PLACE_OFFSET.x, y: pointer.y - PLACE_OFFSET.y })
}

// 置こうとしているアイテムを、ポインタの所に置く。置けたら置くのをやめ、置いたアイテムを選ぶ。紙からはみ出す所なら何もしない。
// 箱は、置くのをやめて追加のダイアログを開き、中身を決めてから置く
export const DRAWING_PLACE = defineCommand({
  id: "drawing.place",
  title: "Place item",
  run: (ctx, a, pointer: Point) => {
    const { stage } = ctx
    const at = placeAt(ctx, pointer)
    const page = stage.opened?.page
    const size = stage.placing && itemSize(ctx.registry, stage.placing)
    const paper = paperOf(stage)
    if (!at || !page || !stage.placing || !stage.opened || !size || !paper || !fitsPaper(at, size, paper)) return
    if (stage.placing === BOX.id) {
      a.stopPlacing(stage.id)
      a.openDialog(stage.id, "box.add", { page, at })
      return
    }
    const done = a.perform("item.place", { page, item: stage.placing, at }, { book: stage.opened.book })
    if (!done.ok) return
    a.stopPlacing(stage.id)
    a.select(stage.id, [done.result.item])
  },
  when: ctx => onDrawingPage(ctx) && ctx.stage.placing !== null,
})

// アイテムを、画面の上で動いた量だけ動かす。はみ出すなら動かさない
export const DRAWING_MOVE = defineCommand({
  id: "drawing.move",
  title: "Move items",
  run: (ctx, a, args: { items: readonly string[]; by: Point }) => {
    const { opened } = ctx.stage
    if (!opened?.page || args.items.length === 0) return
    const by = toPaperDelta(ctx.stage, args.by)
    a.perform("item.move", { page: opened.page, items: [...args.items], by }, { book: opened.book })
  },
  when: onDrawingPage,
})
