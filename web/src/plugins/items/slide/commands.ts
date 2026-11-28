// スライドのコマンド: 画面の操作（置く・動かす・大きさを変える・項目を変える・消す）から、スライドのアクション（slide プラグイン）を呼ぶ。
// 位置と大きさは、プレゼンテーションが決めた紙の上の px で受け取る。置けたら置くのをやめ、置いたアイテムを選ぶ
import { type ItemId, NO_PAPER, NO_PLACING, NOTHING_OPENED, type Point, type Rect, slideOf } from "../../../plugin-api"
import { hasOpenedPage, writesSize } from "../../base"

import { SLIDE_MOVE, SLIDE_PLACE, SLIDE_REMOVE, SLIDE_REORDER, SLIDE_RESIZE, SLIDE_UPDATE } from "./actions"
import { kit } from "./kit"
import { type Order, orderSteps } from "./order"
import { shapeProps } from "./rect"
import { ADDED_EDIT, SLIDE_KEY_SCOPE, SLIDE_TEXT_KEY_SCOPE, TEXT_EDIT } from "./scope"

const PLACE = SLIDE_PLACE.id
const MOVE = SLIDE_MOVE.id
const RESIZE = SLIDE_RESIZE.id
const UPDATE = SLIDE_UPDATE.id
const REMOVE = SLIDE_REMOVE.id
const REORDER = SLIDE_REORDER.id

type Run = Parameters<typeof kit.defineCommand>[0]["run"]
type Ctx = Parameters<Run>[0]
type Actions = Parameters<Run>[1]

// 開いているページの slide のアイテムの id（後ろから前への並び）
function slideIds(ctx: Ctx): string[] {
  return hasOpenedPage(ctx) ? slideOf(ctx.page).map(s => s.id) : []
}

// 選んでいる物のうち、開いているページの slide にあるアイテムの id（選択には、自分の扱わない id が混じる）
function selectedOnSlide(ctx: Ctx): string[] {
  const ids = new Set(slideIds(ctx))
  return ctx.stage.selection.filter(id => ids.has(id))
}

// 置こうとしているアイテムを、枠 rect に置く。props はそのアイテムの項目（文字枠なら text など）。大きさが項目で決まる形（スクラップ）は、左上だけを渡す。置けなければトーストで知らせる
export const SLIDE_PUT = kit.defineCommand({
  id: "slide-put",
  performs: [PLACE],
  permissionScope: "opened-page",
  placesItem: true,
  title: "Place on slide",
  run: (ctx, a, args: { item: ItemId; rect: Rect; props: Record<string, unknown> }) => {
    if (!hasOpenedPage(ctx)) return
    const done = a.perform(
      PLACE,
      {
        item: args.item,
        at: { x: args.rect.x, y: args.rect.y },
        ...(writesSize(ctx.catalog, args.item) ? {} : { w: args.rect.w, h: args.rect.h }),
        props: args.props,
      },
      { page: ctx.page.id },
    )
    if (!done.ok) {
      a.showToast({ kind: "warn", message: kit.message("Cannot place here") })
      return
    }
    a.stopPlacing()
    a.select([(done.result as { item: string }).item])
  },
  when: ctx => hasOpenedPage(ctx) && ctx.stage.placing !== NO_PLACING,
})

// 外から落としたか貼ったファイルから作ったアイテム item（項目の値 props。大きさが項目で決まる形）を、左上が at（紙の上。NO_PAPER ならスライドの左上）から右へ shift の所になるよう置く（置こうとしている物は変えない）。
// ファイルを取り込む間に開いているページが替わっていたら（落としたページ page でなければ）置かない。置けなければトーストで知らせる
export const SLIDE_DROP = kit.defineCommand({
  id: "slide-drop",
  performs: [PLACE],
  permissionScope: "opened-page",
  placesItem: true,
  title: "Place on slide",
  run: (
    ctx,
    a,
    args: { page: string; item: ItemId; at: Point | typeof NO_PAPER; shift: number; props: Record<string, unknown> },
  ) => {
    if (!hasOpenedPage(ctx) || ctx.page.id !== args.page) return
    const from = args.at === NO_PAPER ? { x: 0, y: 0 } : args.at
    const at = { x: Math.round(from.x + args.shift), y: Math.round(from.y) }
    const done = a.perform(PLACE, { item: args.item, at, props: args.props }, { page: ctx.page.id })
    if (!done.ok) {
      a.showToast({ kind: "warn", message: kit.message("Cannot place here") })
      return
    }
    a.select([(done.result as { item: string }).item])
  },
  when: hasOpenedPage,
})

// OS のクリップボードのファイル（画像など）を、スライドのレイヤーに渡す（キー。レイヤーが取り込んでスクラップを置く。ほかの物は貼らない）
export const SLIDE_PASTE_FILES = kit.defineCommand({
  id: "slide-paste-files",
  title: "Paste",
  clipboard: "paste",
  run: (_ctx, a) => {
    a.clipboard.passFiles()
  },
  when: hasOpenedPage,
})

// アイテムを、左上が at（紙の上）になるよう動かす（複数のアイテムを一度に。画面の履歴は 1 段）
export const SLIDE_MOVE_TO = kit.defineCommand({
  id: "slide-move-to",
  performs: [MOVE],
  permissionScope: "opened-page",
  title: "Move on slide",
  run: (ctx, a, args: { moves: readonly { item: string; at: { x: number; y: number } }[] }) => {
    if (!hasOpenedPage(ctx)) return
    for (const m of args.moves) a.perform(MOVE, { item: m.item, at: m.at }, { page: ctx.page.id })
  },
  when: hasOpenedPage,
})

// アイテムの枠を rect にする。scaled なら文字枠の文字も幅の倍率で変える
export const SLIDE_RESHAPE = kit.defineCommand({
  id: "slide-reshape",
  performs: [RESIZE],
  permissionScope: "opened-page",
  title: "Resize on slide",
  run: (ctx, a, args: { item: string; rect: Rect; scaled: boolean }) => {
    if (!hasOpenedPage(ctx)) return
    const { rect } = args
    a.perform(
      RESIZE,
      {
        item: args.item,
        at: { x: rect.x, y: rect.y },
        w: rect.w,
        h: rect.h,
        scale: args.scaled,
      },
      { page: ctx.page.id },
    )
  },
  when: hasOpenedPage,
})

// アイテムの項目を変える（null の項目は消す）。複数のアイテムを一度に変える（画面の履歴は 1 段）
export const SLIDE_SET = kit.defineCommand({
  id: "slide-set",
  performs: [UPDATE],
  permissionScope: "opened-page",
  title: "Change on slide",
  run: (ctx, a, args: { items: readonly string[]; props: Record<string, unknown> }) => {
    if (!hasOpenedPage(ctx)) return
    for (const item of args.items) a.perform(UPDATE, { item, props: args.props }, { page: ctx.page.id })
  },
  when: hasOpenedPage,
})

// 選んでいるアイテムを消し、選択を外す
export const SLIDE_DELETE = kit.defineCommand({
  id: "slide-delete",
  performs: [REMOVE],
  permissionScope: "selection",
  title: "Delete",
  run: (ctx, a) => {
    if (!hasOpenedPage(ctx)) return
    for (const item of selectedOnSlide(ctx)) a.perform(REMOVE, { item }, { page: ctx.page.id })
    a.select([])
  },
  when: ctx => hasOpenedPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 文字を書き換えているアイテム（書き換えの間の、選んでいる 1 つの slide のアイテム）
function editedOnSlide(ctx: Ctx): string | null {
  if (ctx.stage.editing !== TEXT_EDIT && ctx.stage.editing !== ADDED_EDIT) return null
  const chosen = selectedOnSlide(ctx)
  return chosen.length === 1 && ctx.stage.selection.length === 1 ? (chosen[0] ?? null) : null
}

// 文字の書き換えをやめる（書いた字は捨てる）。文字が空のままの文字枠（置いた直後）は残さず、置いたばかりなら置いた操作と画面の履歴の 1 段にする。
// 消すのを認可ステップが止めていても押せ、そのときは消さずに書き換えだけをやめる
export const SLIDE_TEXT_CANCEL = kit.defineCommand({
  id: "slide-text-cancel",
  performs: [REMOVE],
  permissionScope: "opened-page",
  denied: "runs",
  title: "Cancel",
  run: (ctx, a) => {
    const item = editedOnSlide(ctx)
    if (!hasOpenedPage(ctx) || item === null) return
    if (ctx.stage.editing === ADDED_EDIT && ctx.stage.opened !== NOTHING_OPENED)
      a.continueStep(ctx.stage.opened.outermost.id)
    a.setEditing("none")
    const shape = slideOf(ctx.page).find(s => s.id === item)
    if (shape && (shapeProps(shape).text ?? "") === "" && a.perform(REMOVE, { item }, { page: ctx.page.id }).ok)
      a.select([])
  },
  when: ctx => hasOpenedPage(ctx) && editedOnSlide(ctx) !== null,
})

// 選んでいるアイテムの重ねの順を to へ動かす（選んだ物どうしの前後は保つ。画面の履歴は 1 段）
function reorder(ctx: Ctx, a: Actions, to: Order): void {
  if (!hasOpenedPage(ctx)) return
  for (const step of orderSteps(slideIds(ctx), new Set(selectedOnSlide(ctx)), to))
    a.perform(REORDER, { item: step.item, to: step.to }, { page: ctx.page.id })
}

// 選んでいるアイテムを最前面へ
export const SLIDE_TO_FRONT = kit.defineCommand({
  id: "slide-to-front",
  performs: [REORDER],
  permissionScope: "selection",
  title: "To front",
  run: (ctx, a) => reorder(ctx, a, "front"),
  when: ctx => hasOpenedPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムを 1 つ前へ
export const SLIDE_FORWARD = kit.defineCommand({
  id: "slide-forward",
  performs: [REORDER],
  permissionScope: "selection",
  title: "Forward",
  run: (ctx, a) => reorder(ctx, a, "forward"),
  when: ctx => hasOpenedPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムを 1 つ後ろへ
export const SLIDE_BACKWARD = kit.defineCommand({
  id: "slide-backward",
  performs: [REORDER],
  permissionScope: "selection",
  title: "Backward",
  run: (ctx, a) => reorder(ctx, a, "backward"),
  when: ctx => hasOpenedPage(ctx) && selectedOnSlide(ctx).length > 0,
})

// 選んでいるアイテムを最背面へ
export const SLIDE_TO_BACK = kit.defineCommand({
  id: "slide-to-back",
  performs: [REORDER],
  permissionScope: "selection",
  title: "To back",
  run: (ctx, a) => reorder(ctx, a, "back"),
  when: ctx => hasOpenedPage(ctx) && selectedOnSlide(ctx).length > 0,
})

export const SLIDE_KEYS = [
  kit.defineKey({
    id: "slide-text-cancel-escape",
    key: "Escape",
    command: SLIDE_TEXT_CANCEL.id,
    scope: SLIDE_TEXT_KEY_SCOPE.id,
  }),
  kit.defineKey({ id: "slide-delete-delete", key: "Delete", command: SLIDE_DELETE.id, scope: SLIDE_KEY_SCOPE.id }),
  kit.defineKey({ id: "slide-paste-mod-v", key: "Mod+V", command: SLIDE_PASTE_FILES.id, scope: SLIDE_KEY_SCOPE.id }),
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
