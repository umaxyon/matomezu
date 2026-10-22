// 図面の画面から置く・動かすコマンド。画面の座標を受け取り、紙の上の座標に直してアクションを呼ぶ
import type { Point } from "../../../../core/geom"
import { paperOf, toPaper, toPaperDelta } from "../../../../core/stage"
import { type CommandContext, defineCommand } from "../../../../store/commands/def"
import { defineKeys } from "../../../../store/keys"
import { BOX } from "../box"
import type { Came } from "./drag"
import { type Edges, fitsPaper, itemSize, itemsOf, PLACE_OFFSET, resizedBy } from "./items"

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

// アイテムの中身を変えるダイアログを開く（箱は box.edit）。開いているページに無いアイテムなら何もしない。
// 右クリックのメニューでは「設定」として出す
export const DRAWING_EDIT = defineCommand({
  id: "drawing.edit",
  title: "Settings",
  run: (ctx, a, { item }: { item: string }) => {
    const page = ctx.stage.opened?.page
    const book = ctx.book?.type === "drawing" ? ctx.book : null
    const found = book?.pages.find(p => p.id === page)
    const placed = found && itemsOf(found).find(i => i.id === item)
    if (!page || !placed) return
    if (placed.item === BOX.id) a.openDialog(ctx.stage.id, "box.edit", { page, item })
  },
  when: onDrawingPage,
})

// 選んでいるアイテムを消し、選択を外す（選んでいなければ出さない）
export const DRAWING_DELETE = defineCommand({
  id: "drawing.delete",
  title: "Delete",
  run: (ctx, a) => {
    const { opened, selection, id } = ctx.stage
    if (!opened?.page || selection.length === 0) return
    const done = a.perform("item.remove", { page: opened.page, items: [...selection] }, { book: opened.book })
    if (done.ok) a.select(id, [])
  },
  when: ctx => onDrawingPage(ctx) && ctx.stage.selection.length > 0,
})

// アイテムを、画面の上で動いた量だけ動かす（came はドラッグの通り道で覚えた、相手ごとの先端が来た向き）。収まらなければ動かさない
export const DRAWING_MOVE = defineCommand({
  id: "drawing.move",
  title: "Move items",
  run: (ctx, a, args: { items: readonly string[]; by: Point; came?: Came }) => {
    const { opened } = ctx.stage
    if (!opened?.page || args.items.length === 0) return
    const by = toPaperDelta(ctx.stage, args.by)
    const came = args.came && { came: { ...args.came } }
    a.perform("item.move", { page: opened.page, items: [...args.items], by, ...came }, { book: opened.book })
  },
  when: onDrawingPage,
})

// アイテムの辺（角なら 2 つの辺）をつかんで、画面の上で動いた量だけ大きさを変える（items.ts の resizedBy）
export const DRAWING_RESIZE = defineCommand({
  id: "drawing.resize",
  title: "Resize item",
  run: (ctx, a, args: { item: string; edges: Edges; by: Point }) => {
    const { opened } = ctx.stage
    const paper = paperOf(ctx.stage)
    const book = ctx.book?.type === "drawing" ? ctx.book : null
    const page = book?.pages.find(p => p.id === opened?.page)
    const placed = page && itemsOf(page).find(i => i.id === args.item)
    if (!opened?.page || !paper || !placed) return
    const to = resizedBy(ctx.registry, placed, args.edges, toPaperDelta(ctx.stage, args.by), paper)
    if (to) a.perform("item.resize", { page: opened.page, item: placed.id, ...to }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 選んでいるアイテムを消すキー（Mac の delete キーは Backspace として届く）
export const ITEM_KEYS = defineKeys([
  { key: "Delete", command: "drawing.delete", scope: "stage" },
  { key: "Backspace", command: "drawing.delete", scope: "stage" },
])
