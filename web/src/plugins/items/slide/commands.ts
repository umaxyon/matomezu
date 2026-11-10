// スライドのコマンド: 画面の操作（置く・動かす・大きさを変える・項目を変える・消す）から、スライドのアクション（slide プラグイン）を呼ぶ。
// 位置と大きさは、見せ方が決めた紙の上の px で受け取る。置けたら置くのをやめ、置いたアイテムを選ぶ
import { type ItemId, type ItemPage, pagedOf, type Rect, slideOf } from "../../../plugin-api"

import { SLIDE_MOVE, SLIDE_PLACE, SLIDE_REMOVE, SLIDE_REORDER, SLIDE_RESIZE, SLIDE_UPDATE } from "./actions"
import { kit } from "./kit"
import { type Order, orderSteps } from "./order"
import { SLIDE_KEY_SCOPE } from "./scope"

const PLACE = SLIDE_PLACE.id
const MOVE = SLIDE_MOVE.id
const RESIZE = SLIDE_RESIZE.id
const UPDATE = SLIDE_UPDATE.id
const REMOVE = SLIDE_REMOVE.id
const REORDER = SLIDE_REORDER.id

type Run = Parameters<typeof kit.defineCommand>[0]["run"]
type Ctx = Parameters<Run>[0]
type Actions = Parameters<Run>[1]

// 開いているページがあるか
const onPage = (ctx: Ctx): boolean => ctx.stage.opened?.page != null

// 開いているページの slide のアイテムの id（後ろから前への並び）
function slideIds(ctx: Ctx): string[] {
  const page = pagedOf(ctx.book)?.pages.find(p => p.id === ctx.stage.opened?.page)
  return page ? slideOf(page as ItemPage).map(s => s.id) : []
}

// 選んでいる物のうち、開いているページの slide にあるアイテムの id（選択には、自分の扱わない id が混じる）
function selectedOnSlide(ctx: Ctx): string[] {
  const ids = new Set(slideIds(ctx))
  return ctx.stage.selection.filter(id => ids.has(id))
}

// 置こうとしているアイテムを、枠 rect に置く。props はそのアイテムの項目（文字枠なら text など）。置けなければトーストで知らせる
export const SLIDE_PUT = kit.defineCommand({
  id: "slide-put",
  performs: [PLACE],
  permissionScope: "opened-page",
  title: "Place on slide",
  run: (ctx, a, args: { item: ItemId; rect: Rect; props: Record<string, unknown> }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const done = a.perform(
      PLACE,
      {
        page: opened.page,
        item: args.item,
        at: { x: args.rect.x, y: args.rect.y },
        w: args.rect.w,
        h: args.rect.h,
        props: args.props,
      } as never,
      { book: opened.book },
    )
    if (!done.ok) {
      a.showToast({ kind: "warn", message: kit.message("Cannot place here") })
      return
    }
    a.stopPlacing(ctx.stage.id)
    a.select(ctx.stage.id, [(done.result as { item: string }).item])
  },
  when: ctx => onPage(ctx) && ctx.stage.placing !== null,
})

// アイテムを、左上が at（紙の上）になるよう動かす（複数のアイテムを一度に。画面の履歴は 1 段）
export const SLIDE_MOVE_TO = kit.defineCommand({
  id: "slide-move-to",
  performs: [MOVE],
  permissionScope: "opened-page",
  title: "Move on slide",
  run: (ctx, a, args: { moves: readonly { item: string; at: { x: number; y: number } }[] }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    for (const m of args.moves) a.perform(MOVE, { page: opened.page, item: m.item, at: m.at }, { book: opened.book })
  },
  when: onPage,
})

// アイテムの枠を rect にする。scaled なら文字枠の文字も幅の倍率で変える
export const SLIDE_RESHAPE = kit.defineCommand({
  id: "slide-reshape",
  performs: [RESIZE],
  permissionScope: "opened-page",
  title: "Resize on slide",
  run: (ctx, a, args: { item: string; rect: Rect; scaled: boolean }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const { rect } = args
    a.perform(
      RESIZE,
      {
        page: opened.page,
        item: args.item,
        at: { x: rect.x, y: rect.y },
        w: rect.w,
        h: rect.h,
        scale: args.scaled,
      },
      { book: opened.book },
    )
  },
  when: onPage,
})

// アイテムの項目を変える（null の項目は消す）。複数のアイテムを一度に変える（画面の履歴は 1 段）
export const SLIDE_SET = kit.defineCommand({
  id: "slide-set",
  performs: [UPDATE],
  permissionScope: "opened-page",
  title: "Change on slide",
  run: (ctx, a, args: { items: readonly string[]; props: Record<string, unknown> }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    for (const item of args.items)
      a.perform(UPDATE, { page: opened.page, item, props: args.props }, { book: opened.book })
  },
  when: onPage,
})

// 選んでいるアイテムを消し、選択を外す
export const SLIDE_DELETE = kit.defineCommand({
  id: "slide-delete",
  performs: [REMOVE],
  permissionScope: "selection",
  title: "Delete",
  run: (ctx, a) => {
    const { opened, id } = ctx.stage
    if (!opened?.page) return
    for (const item of selectedOnSlide(ctx)) a.perform(REMOVE, { page: opened.page, item }, { book: opened.book })
    a.select(id, [])
  },
  when: ctx => onPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムの重ねの順を to へ動かす（選んだ物どうしの前後は保つ。画面の履歴は 1 段）
function reorder(ctx: Ctx, a: Actions, to: Order): void {
  const { opened } = ctx.stage
  if (!opened?.page) return
  for (const step of orderSteps(slideIds(ctx), new Set(selectedOnSlide(ctx)), to))
    a.perform(REORDER, { page: opened.page, item: step.item, to: step.to }, { book: opened.book })
}

// 選んでいるアイテムを最前面へ
export const SLIDE_TO_FRONT = kit.defineCommand({
  id: "slide-to-front",
  performs: [REORDER],
  permissionScope: "selection",
  title: "To front",
  run: (ctx, a) => reorder(ctx, a, "front"),
  when: ctx => onPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムを 1 つ前へ
export const SLIDE_FORWARD = kit.defineCommand({
  id: "slide-forward",
  performs: [REORDER],
  permissionScope: "selection",
  title: "Forward",
  run: (ctx, a) => reorder(ctx, a, "forward"),
  when: ctx => onPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムを 1 つ後ろへ
export const SLIDE_BACKWARD = kit.defineCommand({
  id: "slide-backward",
  performs: [REORDER],
  permissionScope: "selection",
  title: "Backward",
  run: (ctx, a) => reorder(ctx, a, "backward"),
  when: ctx => onPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムを最背面へ
export const SLIDE_TO_BACK = kit.defineCommand({
  id: "slide-to-back",
  performs: [REORDER],
  permissionScope: "selection",
  title: "To back",
  run: (ctx, a) => reorder(ctx, a, "back"),
  when: ctx => onPage(ctx) && selectedOnSlide(ctx).length > 0,
})

export const SLIDE_KEYS = [
  kit.defineKey({ id: "slide-delete-delete", key: "Delete", command: SLIDE_DELETE.id, scope: SLIDE_KEY_SCOPE.id }),
  kit.defineKey({
    id: "slide-delete-backspace",
    key: "Backspace",
    command: SLIDE_DELETE.id,
    scope: SLIDE_KEY_SCOPE.id,
  }),
  // 重なり順のキーは、ブラウザの戻る・進む（Mac は Cmd+[ ]）やタブの切り替え（Cmd+Shift+[ ]）と重ならないよう Alt も押す。
  // Alt を押した [ ] は、Mac では別の文字になるので、キーの位置から決まる（Shift は修飾キーとして付く）
  kit.defineKey({
    id: "slide-to-front-mod-alt-shift-bracket-right",
    key: "Mod+Alt+Shift+]",
    command: SLIDE_TO_FRONT.id,
    scope: SLIDE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "slide-to-back-mod-alt-shift-bracket-left",
    key: "Mod+Alt+Shift+[",
    command: SLIDE_TO_BACK.id,
    scope: SLIDE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "slide-forward-mod-alt-bracket-right",
    key: "Mod+Alt+]",
    command: SLIDE_FORWARD.id,
    scope: SLIDE_KEY_SCOPE.id,
  }),
  kit.defineKey({
    id: "slide-backward-mod-alt-bracket-left",
    key: "Mod+Alt+[",
    command: SLIDE_BACKWARD.id,
    scope: SLIDE_KEY_SCOPE.id,
  }),
]
