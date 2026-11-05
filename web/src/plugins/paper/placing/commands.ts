// 紙のビューから置く・動かすコマンド。画面の座標を受け取り、紙の上の座標に直してアクションを呼ぶ

import {
  areaOf,
  type CommandContext,
  connectorsOf,
  findShape,
  type Point,
  pagedOf,
  type ShapeAddArgs,
  shapeDialogs,
  shapesOf,
  toPaperDelta,
} from "../../../plugin-api"
import { amongSelected, type Edges, inPaper, itemSize, refusalMessage, resizedBy, shapeDefOf } from "../../base"
import { kit } from "../kit"
import { ITEM_MOVE, ITEM_PLACE, ITEM_REMOVE, ITEM_REPARENT, ITEM_RESIZE, ITEM_UPDATE } from "./actions"
import type { Came } from "./drag"
import { PLACE_OFFSET, placeTarget } from "./items"

// ページを開いているか（ページの無いブックと、ページが 1 枚も無いブックでは開いていない）
const onOpenedPage = (ctx: CommandContext) => ctx.stage.opened?.page != null

// 置こうとしているアイテムの左上（紙の上）。ポインタ（表示領域の左上から）を PLACE_OFFSET だけ戻した所を、toPaperAt で紙の上の点に直す
export function placeAt(toPaperAt: (p: Point) => Point | null, pointer: Point): Point | null {
  return toPaperAt({ x: pointer.x - PLACE_OFFSET.x, y: pointer.y - PLACE_OFFSET.y })
}

// 置こうとしているアイテムを、ポインタの所に置く（置く先は items.ts の placeTarget: 子を持てる形の上ならその中、子を持てない形の上ならその親の中の空き）。
// ほかの形とぶつかれば押す（crowd: push。追加のダイアログも同じに渡す）。置けたら置くのをやめ、置いたアイテムを選ぶ。ページのはみ出す所なら何もしない。空きが無い・置けないならトーストで知らせる（空きが無いのと、紙に収まらないのは別の文）。
// 追加のダイアログのあるアイテム（箱・リスト）は、置くのをやめて追加のダイアログを開き（置く所を ShapeAddArgs で渡す）、中身を決めてから置く
export const PAPER_PLACE = kit.defineCommand({
  id: "paper-place",
  performs: [ITEM_PLACE.id],
  permissionScope: "opened-page",
  title: "Place item",
  run: (ctx, a, pointer: Point) => {
    const { stage } = ctx
    const at = placeAt(ctx.toPaper, pointer)
    const point = ctx.toPaper(pointer)
    const book = pagedOf(ctx.book)
    const page = book?.pages.find(p => p.id === stage.opened?.page)
    const size = stage.placing && itemSize(ctx.catalog, stage.placing)
    const paper = areaOf(stage)
    if (!at || !point || !book || !page || !stage.placing || !stage.opened || !size || !paper) return
    const target = placeTarget(ctx.catalog, book, page, point, at, size)
    const warn = (done: { reason: string; permission?: string }) =>
      a.showToast({
        kind: "warn",
        message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")),
      })
    if (!target) {
      a.showToast({ kind: "warn", message: kit.message("No free spot") })
      return
    }
    if (target.parent === null && !inPaper({ ...target.shown, ...size }, paper)) return
    // 空きに置くなら座標を渡さず、中身を決めた大きさで item-place が空きを選ぶ
    const where: ShapeAddArgs = {
      page: page.id,
      ...(target.free ? {} : { at: target.at }),
      ...(target.parent === null ? {} : { parent: target.parent }),
    }
    // 形の定義が名指す追加のダイアログ（無ければそのまま置く）
    const def = shapeDefOf(ctx.catalog, stage.placing)
    const dialog = def && shapeDialogs(def).add
    if (dialog) {
      a.stopPlacing(stage.id)
      a.openDialog(stage.id, dialog, where)
      return
    }
    const done = a.perform(ITEM_PLACE.id, { ...where, item: stage.placing, crowd: "push" }, { book: stage.opened.book })
    if (!done.ok) {
      warn(done)
      return
    }
    a.stopPlacing(stage.id)
    a.select(stage.id, [done.result.item])
  },
  when: ctx => onOpenedPage(ctx) && ctx.stage.placing !== null,
})

// 右クリックされた形が編集のダイアログを持つか（右クリックのメニューが開いていなければ、呼んだ所が形を選んでいる）。
// いくつか選んでいて、その中の物を右クリックしたなら、メニューは選んだ物全部に向けるので出さない
function editable(ctx: CommandContext): boolean {
  const target = ctx.contextMenu?.target as { item?: string } | undefined
  if (target?.item === undefined) return true
  if (amongSelected(ctx.stage.selection, target.item)) return false
  const page = pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)
  const placed = page && findShape(page, target.item)?.shape
  const def = placed && shapeDefOf(ctx.catalog, placed.item)
  return def ? shapeDialogs(def).edit !== undefined : false
}

// アイテムの中身を変えるダイアログを開く（アイテムの定義の dialogs.edit。どの深さの子の形も）。開いているページに無いアイテムなら何もしない。
// 右クリックのメニューでは「設定」として出す
export const PAPER_EDIT = kit.defineCommand({
  id: "paper-edit",
  performs: [ITEM_UPDATE.id],
  permissionScope: "opened-page",
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
  when: ctx => onOpenedPage(ctx) && editable(ctx),
})

// 選んでいる物が、開いているページのアイテム（どの深さの形も、つなぐものも）だけか（リストの行など、形の中の物が混じれば、ほかのコマンドの物）
function itemsSelected(ctx: CommandContext): boolean {
  const page = pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)
  const { selection } = ctx.stage
  if (!page || selection.length === 0) return false
  const connectors = new Set(connectorsOf(page).map(c => c.id))
  return selection.every(id => connectors.has(id) || findShape(page, id) !== undefined)
}

// 選んでいるアイテムを全部消し、選択を外す（アイテムだけを選んでいるときに出す）
export const PAPER_DELETE = kit.defineCommand({
  id: "paper-delete",
  performs: [ITEM_REMOVE.id],
  permissionScope: "selection",
  title: "Delete",
  run: (ctx, a) => {
    const { opened, selection, id } = ctx.stage
    if (!opened?.page || selection.length === 0) return
    const done = a.perform(ITEM_REMOVE.id, { page: opened.page, items: [...selection] }, { book: opened.book })
    if (done.ok) a.select(id, [])
  },
  when: itemsSelected,
})

// 開いているページの、ページの形（子の形は除く）と、両端がどちらもページの形のつなぐものを全部選ぶ
export const PAPER_SELECT_ALL = kit.defineCommand({
  id: "paper-select-all",
  title: "Select all",
  run: (ctx, a) => {
    const page = pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)
    if (!page) return
    const shapes = new Set(shapesOf(page).map(s => s.id))
    const connectors = connectorsOf(page).filter(c => shapes.has(c.from) && shapes.has(c.to))
    a.select(ctx.stage.id, [...shapes, ...connectors.map(c => c.id)])
  },
  when: onOpenedPage,
})

// アイテムを、画面の上で動いた量だけ動かす（came はドラッグの通り道で覚えた、相手ごとの先端が来た向き）。収まらなければ動かさない
export const PAPER_MOVE = kit.defineCommand({
  id: "paper-move",
  performs: [ITEM_MOVE.id],
  permissionScope: "opened-page",
  title: "Move items",
  run: (ctx, a, args: { items: readonly string[]; by: Point; came?: Came }) => {
    const { opened } = ctx.stage
    if (!opened?.page || args.items.length === 0) return
    const by = toPaperDelta(ctx.stage, args.by)
    const came = args.came && { came: { ...args.came } }
    const crowd = "push" as const
    a.perform(ITEM_MOVE.id, { page: opened.page, items: [...args.items], by, crowd, ...came }, { book: opened.book })
  },
  when: onOpenedPage,
})

// 付け替えの道具のドラッグを離したとき: 形 item を、画面の上で動いた量 by だけ動かした所で、形 parent の中へ入れる（null はページへ出す）。
// 今と同じ親なら、その中で動かすだけ（item-move）。入れられなければ何もしない
export const PAPER_REPARENT = kit.defineCommand({
  id: "paper-reparent",
  performs: [ITEM_REPARENT.id, ITEM_MOVE.id],
  permissionScope: "opened-page",
  title: "Reparent item",
  run: (ctx, a, args: { item: string; parent: string | null; by: Point }) => {
    const { opened } = ctx.stage
    const page = pagedOf(ctx.book)?.pages.find(p => p.id === opened?.page)
    const found = page && findShape(page, args.item)
    if (!opened?.page || !found) return
    const by = toPaperDelta(ctx.stage, args.by)
    const on = { book: opened.book }
    if (found.parent === args.parent) {
      a.perform(ITEM_MOVE.id, { page: opened.page, items: [args.item], by, crowd: "push" }, on)
      return
    }
    const at = { x: found.at.x + by.x, y: found.at.y + by.y }
    a.perform(ITEM_REPARENT.id, { page: opened.page, item: args.item, parent: args.parent, at, crowd: "push" }, on)
  },
  when: onOpenedPage,
})

// アイテムの辺（角なら 2 つの辺）をつかんで、画面の上で動いた量だけ大きさを変える（items.ts の resizedBy）
export const PAPER_RESIZE = kit.defineCommand({
  id: "paper-resize",
  performs: [ITEM_RESIZE.id],
  permissionScope: "opened-page",
  title: "Resize item",
  run: (ctx, a, args: { item: string; edges: Edges; by: Point }) => {
    const { opened } = ctx.stage
    const paper = areaOf(ctx.stage)
    const book = pagedOf(ctx.book) ?? null
    const page = book?.pages.find(p => p.id === opened?.page)
    const placed = page && findShape(page, args.item)?.shape
    if (!opened?.page || !paper || !placed) return
    const to = resizedBy(ctx.catalog, placed, args.edges, toPaperDelta(ctx.stage, args.by), paper)
    if (to) a.perform(ITEM_RESIZE.id, { page: opened.page, item: placed.id, ...to }, { book: opened.book })
  },
  when: onOpenedPage,
})

// 選んでいるアイテムを消すキー（Mac の delete キーは Backspace として届く）と、全部を選ぶキー
export const ITEM_KEYS = [
  kit.defineKey({ id: "paper-delete-delete", key: "Delete", command: PAPER_DELETE.id, scope: "stage" }),
  kit.defineKey({ id: "paper-delete-backspace", key: "Backspace", command: PAPER_DELETE.id, scope: "stage" }),
  kit.defineKey({ id: "paper-select-all-mod-a", key: "Mod+A", command: PAPER_SELECT_ALL.id, scope: "stage" }),
]
