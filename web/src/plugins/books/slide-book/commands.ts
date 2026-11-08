// スライドのブックのコマンド: 画面の操作（置く・動かす・大きさを変える・項目を変える・比率を戻す・消す）から、スライドのアクション（slide プラグイン）を呼ぶ。
// 位置と大きさは、見せ方が決めた紙の上の px で受け取る。置けたら置くのをやめ、置いたアイテムを選ぶ
import type { ItemId, Rect } from "../../../plugin-api"

import { kit } from "./kit"
import { SLIDE_KEY_SCOPE } from "./slide-book"

const PLACE = "@matomezu/slide:slide-place"
const MOVE = "@matomezu/slide:slide-move"
const RESIZE = "@matomezu/slide:slide-resize"
const UPDATE = "@matomezu/slide:slide-update"
const RESET_RATIO = "@matomezu/slide:slide-reset-ratio"
const REMOVE = "@matomezu/slide:slide-remove"

type Ctx = Parameters<Parameters<typeof kit.defineCommand>[0]["run"]>[0]

// 開いているページがあるか
const onPage = (ctx: Ctx): boolean => ctx.stage.opened?.page != null

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

// アイテムを、左上が at（紙の上）になるよう動かす
export const SLIDE_MOVE_TO = kit.defineCommand({
  id: "slide-move-to",
  performs: [MOVE],
  permissionScope: "opened-page",
  title: "Move on slide",
  run: (ctx, a, args: { item: string; at: { x: number; y: number } }) => {
    const { opened } = ctx.stage
    if (opened?.page) a.perform(MOVE, { page: opened.page, item: args.item, at: args.at }, { book: opened.book })
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

// アイテムの項目を変える（null の項目は消す）
export const SLIDE_SET = kit.defineCommand({
  id: "slide-set",
  performs: [UPDATE],
  permissionScope: "opened-page",
  title: "Change on slide",
  run: (ctx, a, args: { item: string; props: Record<string, unknown> }) => {
    const { opened } = ctx.stage
    if (opened?.page)
      a.perform(UPDATE, { page: opened.page, item: args.item, props: args.props }, { book: opened.book })
  },
  when: onPage,
})

// アイテムの比率を、置いたときの比率に戻す
export const SLIDE_RESET = kit.defineCommand({
  id: "slide-reset",
  performs: [RESET_RATIO],
  permissionScope: "opened-page",
  title: "Reset ratio",
  run: (ctx, a, args: { item: string }) => {
    const { opened } = ctx.stage
    if (opened?.page) a.perform(RESET_RATIO, { page: opened.page, item: args.item }, { book: opened.book })
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
    const { opened, selection, id } = ctx.stage
    if (!opened?.page) return
    for (const item of selection) a.perform(REMOVE, { page: opened.page, item }, { book: opened.book })
    a.select(id, [])
  },
  when: ctx => onPage(ctx) && ctx.stage.selection.length > 0,
})

export const SLIDE_KEYS = [
  kit.defineKey({ id: "slide-delete-delete", key: "Delete", command: SLIDE_DELETE.id, scope: SLIDE_KEY_SCOPE.id }),
  kit.defineKey({
    id: "slide-delete-backspace",
    key: "Backspace",
    command: SLIDE_DELETE.id,
    scope: SLIDE_KEY_SCOPE.id,
  }),
]
