// 紙のビューから置く・動かすコマンド。画面の座標を受け取り、紙の上の座標に直してアクションを呼ぶ

import {
  type CommandContext,
  findShape,
  type Point,
  pagedOf,
  paperOf,
  type StageView,
  shapeDialogs,
  toPaper,
  toPaperDelta,
} from "../../../plugin-api"
import { type Edges, fitsPaper, itemSize, resizedBy, shapeDefOf } from "../../base"
import { kit } from "../kit"
import { ITEM_MOVE, ITEM_PLACE, ITEM_REMOVE, ITEM_REPARENT, ITEM_RESIZE, ITEM_UPDATE } from "./actions"
import type { Came } from "./drag"
import { PLACE_OFFSET } from "./items"

const onDrawingPage = (ctx: CommandContext) => pagedOf(ctx.book) !== undefined && ctx.stage.opened?.page != null

// 置こうとしているアイテムの左上（紙の上）。ポインタ（表示領域の左上から）を PLACE_OFFSET だけ戻した所
export function placeAt(ctx: { stage: Pick<StageView, "opened" | "pan" | "zoom"> }, pointer: Point): Point | null {
  return toPaper(ctx.stage, { x: pointer.x - PLACE_OFFSET.x, y: pointer.y - PLACE_OFFSET.y })
}

// 置こうとしているアイテムを、ポインタの所に置く。置けたら置くのをやめ、置いたアイテムを選ぶ。紙からはみ出す所なら何もしない。
// 追加のダイアログのあるアイテム（箱・リスト）は、置くのをやめて追加のダイアログを開き、中身を決めてから置く
export const PAPER_PLACE = kit.defineCommand({
  id: "paper-place",
  performs: [ITEM_PLACE.id],
  title: "Place item",
  run: (ctx, a, pointer: Point) => {
    const { stage } = ctx
    const at = placeAt(ctx, pointer)
    const page = stage.opened?.page
    const size = stage.placing && itemSize(ctx.catalog, stage.placing)
    const paper = paperOf(stage)
    if (!at || !page || !stage.placing || !stage.opened || !size || !paper || !fitsPaper(at, size, paper)) return
    // 形の定義が名指す追加のダイアログ（無ければそのまま置く）
    const def = shapeDefOf(ctx.catalog, stage.placing)
    const dialog = def && shapeDialogs(def).add
    if (dialog) {
      a.stopPlacing(stage.id)
      a.openDialog(stage.id, dialog, { page, at })
      return
    }
    const done = a.perform(ITEM_PLACE.id, { page, item: stage.placing, at }, { book: stage.opened.book })
    if (!done.ok) return
    a.stopPlacing(stage.id)
    a.select(stage.id, [done.result.item])
  },
  when: ctx => onDrawingPage(ctx) && ctx.stage.placing !== null,
})

// 右クリックされた形が編集のダイアログを持つか（右クリックのメニューが開いていなければ、呼んだ所が形を選んでいる）
function editable(ctx: CommandContext): boolean {
  const target = ctx.contextMenu?.target as { item?: string } | undefined
  if (target?.item === undefined) return true
  const page = pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)
  const placed = page && findShape(page, target.item)?.shape
  const def = placed && shapeDefOf(ctx.catalog, placed.item)
  return def ? shapeDialogs(def).edit !== undefined : false
}

// アイテムの中身を変えるダイアログを開く（箱は box-edit、リストは list-edit。どの深さの子の形も）。開いているページに無いアイテムなら何もしない。
// 右クリックのメニューでは「設定」として出す
export const PAPER_EDIT = kit.defineCommand({
  id: "paper-edit",
  performs: [ITEM_UPDATE.id],
  title: "Settings",
  run: (ctx, a, { item }: { item: string }) => {
    const page = ctx.stage.opened?.page
    const book = pagedOf(ctx.book) ?? null
    const found = book?.pages.find(p => p.id === page)
    const placed = found && findShape(found, item)?.shape
    const def = placed && shapeDefOf(ctx.catalog, placed.item)
    const dialog = def && shapeDialogs(def).edit
    if (!page || !dialog) return
    a.openDialog(ctx.stage.id, dialog, { page, item })
  },
  // 右クリックのメニューでは、編集のダイアログを持つ形のときだけ出す
  when: ctx => onDrawingPage(ctx) && editable(ctx),
})

// 選んでいるアイテムを消し、選択を外す（選んでいなければ出さない）
export const PAPER_DELETE = kit.defineCommand({
  id: "paper-delete",
  performs: [ITEM_REMOVE.id],
  title: "Delete",
  run: (ctx, a) => {
    const { opened, selection, id } = ctx.stage
    if (!opened?.page || selection.length === 0) return
    const done = a.perform(ITEM_REMOVE.id, { page: opened.page, items: [...selection] }, { book: opened.book })
    if (done.ok) a.select(id, [])
  },
  when: ctx => onDrawingPage(ctx) && ctx.stage.selection.length > 0,
})

// アイテムを、画面の上で動いた量だけ動かす（came はドラッグの通り道で覚えた、相手ごとの先端が来た向き）。収まらなければ動かさない
export const PAPER_MOVE = kit.defineCommand({
  id: "paper-move",
  performs: [ITEM_MOVE.id],
  title: "Move items",
  run: (ctx, a, args: { items: readonly string[]; by: Point; came?: Came }) => {
    const { opened } = ctx.stage
    if (!opened?.page || args.items.length === 0) return
    const by = toPaperDelta(ctx.stage, args.by)
    const came = args.came && { came: { ...args.came } }
    a.perform(ITEM_MOVE.id, { page: opened.page, items: [...args.items], by, ...came }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 付け替えの道具のドラッグを離したとき: 形 item を、画面の上で動いた量 by だけ動かした所で、形 parent の中へ入れる（null はページへ出す）。
// 今と同じ親なら、その中で動かすだけ（item-move）。入れられなければ何もしない
export const PAPER_REPARENT = kit.defineCommand({
  id: "paper-reparent",
  performs: [ITEM_REPARENT.id, ITEM_MOVE.id],
  title: "Reparent item",
  run: (ctx, a, args: { item: string; parent: string | null; by: Point }) => {
    const { opened } = ctx.stage
    const page = pagedOf(ctx.book)?.pages.find(p => p.id === opened?.page)
    const found = page && findShape(page, args.item)
    if (!opened?.page || !found) return
    const by = toPaperDelta(ctx.stage, args.by)
    const on = { book: opened.book }
    if (found.parent === args.parent) {
      a.perform(ITEM_MOVE.id, { page: opened.page, items: [args.item], by }, on)
      return
    }
    const at = { x: found.at.x + by.x, y: found.at.y + by.y }
    a.perform(ITEM_REPARENT.id, { page: opened.page, item: args.item, parent: args.parent, at }, on)
  },
  when: onDrawingPage,
})

// アイテムの辺（角なら 2 つの辺）をつかんで、画面の上で動いた量だけ大きさを変える（items.ts の resizedBy）
export const PAPER_RESIZE = kit.defineCommand({
  id: "paper-resize",
  performs: [ITEM_RESIZE.id],
  title: "Resize item",
  run: (ctx, a, args: { item: string; edges: Edges; by: Point }) => {
    const { opened } = ctx.stage
    const paper = paperOf(ctx.stage)
    const book = pagedOf(ctx.book) ?? null
    const page = book?.pages.find(p => p.id === opened?.page)
    const placed = page && findShape(page, args.item)?.shape
    if (!opened?.page || !paper || !placed) return
    const to = resizedBy(ctx.catalog, placed, args.edges, toPaperDelta(ctx.stage, args.by), paper)
    if (to) a.perform(ITEM_RESIZE.id, { page: opened.page, item: placed.id, ...to }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 選んでいるアイテムを消すキー（Mac の delete キーは Backspace として届く）
export const ITEM_KEYS = [
  kit.defineKey({ id: "paper-delete-delete", key: "Delete", command: PAPER_DELETE.id, scope: "stage" }),
  kit.defineKey({ id: "paper-delete-backspace", key: "Backspace", command: PAPER_DELETE.id, scope: "stage" }),
]
