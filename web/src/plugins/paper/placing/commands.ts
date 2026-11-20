// 紙のビューから置く・動かすコマンド。画面の座標を受け取り、紙の上の座標に直してアクションを呼ぶ

import {
  areaOf,
  type CommandContext,
  connectorsOf,
  findShape,
  type MessageKey,
  type Point,
  type ShapeAddArgs,
  shapeDialogs,
  shapesOf,
  toPaperDelta,
} from "../../../plugin-api"
import { amongSelected, type Edges, hasOpenedPage, refusalMessage, shapeDefOf } from "../../base"
import { kit } from "../kit"
import { ITEM_MOVE, ITEM_PLACE, ITEM_REMOVE, ITEM_REPARENT, ITEM_RESIZE, ITEM_UPDATE } from "./actions"
import { NO_FREE_SPOT } from "./crowd"
import type { Came } from "./drag"
import { nearestMove, nearestReparent, PLACE_OFFSET, placeTarget, placingShape, stretchedBy } from "./items"

// 置こうとしているアイテムの左上（紙の上）。ポインタ（表示領域の左上から）を PLACE_OFFSET だけ戻した所を、toPaperAt で紙の上の点に直す
export function placeAt(toPaperAt: (p: Point) => Point | null, pointer: Point): Point | null {
  return toPaperAt({ x: pointer.x - PLACE_OFFSET.x, y: pointer.y - PLACE_OFFSET.y })
}

// 置こうとしているアイテムを、ポインタの所に置く（置く先は items.ts の placeTarget: 子を持てる形の上ならその中、子を持てない形の上ならその親の中の空き）。
// ほかの形とぶつかれば押す（crowd: push）。置けたら置くのをやめ、置いたアイテムを選ぶ。空きが無い・置けない（紙からはみ出す。押しても収まらない）ならトーストで知らせる（空きが無いのと、紙に収まらないのは別の文）。
// 追加のダイアログのあるアイテム（箱・リスト）は、置くのをやめて追加のダイアログを開き、置き方（ShapeAddArgs の place。置く所を閉じ込める）を渡す。
// ダイアログは中身を決めて place を呼び、断られれば閉じずにその文を出す
export const PAPER_PLACE = kit.defineCommand({
  id: "paper-place",
  performs: [ITEM_PLACE.id],
  permissionScope: "opened-page",
  title: "Place item",
  run: (ctx, a, pointer: Point) => {
    const { stage } = ctx
    const at = placeAt(ctx.toPaper, pointer)
    const point = ctx.toPaper(pointer)
    const placing = stage.placing
    const shape = placing && placingShape(ctx.catalog, placing.item, placing.props)
    if (!at || !point || !hasOpenedPage(ctx) || !placing || !shape) return
    const page = ctx.page
    const target = placeTarget(ctx.catalog, page, point, at, shape)
    if (!target) {
      a.showToast({ kind: "warn", message: kit.message("No free spot") })
      return
    }
    if (!target.fits) {
      a.showToast({ kind: "warn", message: kit.message("Does not fit on the paper") })
      return
    }
    // 空きに置くなら座標を渡さず、中身を決めた大きさで item-place が空きを選ぶ
    const where = {
      ...(target.free ? {} : { at: target.at }),
      ...(target.parent === null ? {} : { parent: target.parent }),
    }
    // 項目の値 props で置いて選ぶ。断られたら断りの文
    const place = (props: Readonly<Record<string, unknown>> | undefined): MessageKey | null => {
      const given = props ? { props } : {}
      const done = a.perform(
        ITEM_PLACE.id,
        { ...where, item: placing.item, ...given, crowd: "push" },
        { page: page.id },
      )
      if (!done.ok) {
        const fallback = "kind" in done && done.kind === NO_FREE_SPOT ? "No free spot" : "Does not fit on the paper"
        return refusalMessage(ctx.catalog, done, kit.message(fallback))
      }
      a.select([done.result.item])
      return null
    }
    // 形の定義が名指す追加のダイアログ（無ければそのまま置く。置こうとしている物が項目の値を持っていれば、聞かずにその値で置く）
    const def = shapeDefOf(ctx.catalog, placing.item)
    const dialog = def && shapeDialogs(def).add
    if (dialog && !placing.props) {
      a.stopPlacing()
      const args: ShapeAddArgs = { page: page.id, place }
      a.openDialog(dialog, args)
      return
    }
    const refused = place(placing.props)
    if (refused) {
      a.showToast({ kind: "warn", message: refused })
      return
    }
    a.stopPlacing()
  },
  when: ctx => hasOpenedPage(ctx) && ctx.stage.placing !== null,
})

// 右クリックされた形が編集のダイアログを持つか（右クリックのメニューが開いていなければ、呼んだ所が形を選んでいる）。
// いくつか選んでいて、その中の物を右クリックしたなら、メニューは選んだ物全部に向けるので出さない
function editable(ctx: CommandContext): boolean {
  const target = ctx.contextMenu?.target as { item?: string } | undefined
  if (target?.item === undefined) return true
  if (amongSelected(ctx.stage.selection, target.item)) return false
  const placed = hasOpenedPage(ctx) && findShape(ctx.page, target.item)?.shape
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
    if (!hasOpenedPage(ctx)) return
    const placed = findShape(ctx.page, item)?.shape
    const def = placed && shapeDefOf(ctx.catalog, placed.item)
    const dialog = def && shapeDialogs(def).edit
    if (!dialog) return
    a.openDialog(dialog, { page: ctx.page.id, item })
  },
  // 右クリックのメニューでは、編集のダイアログを持つ形のときだけ出す
  when: ctx => hasOpenedPage(ctx) && editable(ctx),
})

// 選んでいる物が、開いているページのアイテム（どの深さの形も、つなぐものも）だけか（リストの行など、形の中の物が混じれば、ほかのコマンドの物）
export function itemsSelected(ctx: CommandContext): boolean {
  const { selection } = ctx.stage
  if (!hasOpenedPage(ctx) || selection.length === 0) return false
  const page = ctx.page
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
    const { selection } = ctx.stage
    if (!hasOpenedPage(ctx) || selection.length === 0) return
    const done = a.perform(ITEM_REMOVE.id, { items: [...selection] }, { page: ctx.page.id })
    if (done.ok) a.select([])
  },
  when: itemsSelected,
})

// 開いているページの、ページの形（子の形は除く）と、両端がどちらもページの形のつなぐものを全部選ぶ
export const PAPER_SELECT_ALL = kit.defineCommand({
  id: "paper-select-all",
  title: "Select all",
  run: (ctx, a) => {
    if (!hasOpenedPage(ctx)) return
    const page = ctx.page
    const shapes = new Set(shapesOf(page).map(s => s.id))
    const connectors = connectorsOf(page).filter(c => shapes.has(c.from) && shapes.has(c.to))
    a.select([...shapes, ...connectors.map(c => c.id)])
  },
  when: hasOpenedPage,
})

// アイテムを、画面の上で動いた量だけ動かす（came はドラッグの通り道で覚えた、相手ごとの先端が来た向き）。
// 動いた量では収まらないとき（紙や子の領域の端の外・近すぎる所）は、収まる一番近い所まで寄せる（nearestMove）。どこにも収まらなければ動かさない
export const PAPER_MOVE = kit.defineCommand({
  id: "paper-move",
  performs: [ITEM_MOVE.id],
  permissionScope: "opened-page",
  title: "Move items",
  run: (ctx, a, args: { items: readonly string[]; by: Point; came?: Came }) => {
    if (!hasOpenedPage(ctx) || args.items.length === 0) return
    const page = ctx.page
    const asked = toPaperDelta(ctx.stage, args.by)
    const came = args.came && { came: { ...args.came } }
    const crowd = "push" as const
    const by = nearestMove(ctx.catalog, page, args.items, asked, args.came) || asked
    a.perform(ITEM_MOVE.id, { items: [...args.items], by, crowd, ...came }, { page: page.id })
  },
  when: hasOpenedPage,
})

// 付け替えの道具のドラッグを離したとき: 形 item を、画面の上で動いた量 by だけ動かした所で、形 parent の中へ入れる（null はページへ出す）。
// 今と同じ親なら、その中で動かすだけ（item-move。収まる一番近い所へ寄せる）。入れられなければ、入れる先の子の領域の左上（ページなら今の位置）へ寄せ、入れられる一番近い所へ入れる（nearestReparent）。どこにも入れられなければ何もしない
export const PAPER_REPARENT = kit.defineCommand({
  id: "paper-reparent",
  performs: [ITEM_REPARENT.id, ITEM_MOVE.id],
  permissionScope: "opened-page",
  title: "Reparent item",
  run: (ctx, a, args: { item: string; parent: string | null; by: Point }) => {
    if (!hasOpenedPage(ctx)) return
    const page = ctx.page
    const found = findShape(page, args.item)
    if (!found) return
    const by = toPaperDelta(ctx.stage, args.by)
    const on = { page: page.id }
    if (found.parent === args.parent) {
      const near = nearestMove(ctx.catalog, page, [args.item], by)
      a.perform(ITEM_MOVE.id, { items: [args.item], by: near || by, crowd: "push" }, on)
      return
    }
    const asked = { x: found.at.x + by.x, y: found.at.y + by.y }
    const at = nearestReparent(ctx.catalog, page, args.item, args.parent, asked) || asked
    a.perform(ITEM_REPARENT.id, { item: args.item, parent: args.parent, at, crowd: "push" }, on)
  },
  when: hasOpenedPage,
})

// アイテムの辺（角なら 2 つの辺）をつかんで、画面の上で動いた量だけ大きさを変える（items.ts の resizedBy）
export const PAPER_RESIZE = kit.defineCommand({
  id: "paper-resize",
  performs: [ITEM_RESIZE.id],
  permissionScope: "opened-page",
  title: "Resize item",
  run: (ctx, a, args: { item: string; edges: Edges; by: Point }) => {
    const paper = areaOf(ctx.stage)
    if (!hasOpenedPage(ctx) || !paper) return
    const page = ctx.page
    const placed = findShape(page, args.item)?.shape
    if (!placed) return
    const to = stretchedBy(ctx.catalog, placed, args.edges, toPaperDelta(ctx.stage, args.by), paper)
    if (to) a.perform(ITEM_RESIZE.id, { item: placed.id, ...to }, { page: page.id })
  },
  when: hasOpenedPage,
})

// 選んでいるアイテムを消すキー（Mac の delete キーは Backspace として届く）と、全部を選ぶキー
export const ITEM_KEYS = [
  kit.defineKey({ id: "paper-delete-delete", key: "Delete", command: PAPER_DELETE.id, scope: "stage" }),
  kit.defineKey({ id: "paper-delete-backspace", key: "Backspace", command: PAPER_DELETE.id, scope: "stage" }),
  kit.defineKey({ id: "paper-select-all-mod-a", key: "Mod+A", command: PAPER_SELECT_ALL.id, scope: "stage" }),
]
