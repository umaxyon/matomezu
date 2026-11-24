// 窓のスクリーンの定義（ブックスクリーン）と、窓のコマンド: カレントスクリーン（ステージを並べないスクリーンかブックスクリーン）の切り替え
import { z } from "zod"
import {
  arrangementValueIn,
  calledScreenIdOf,
  type OpenScreen,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
} from "../../../store/commands/def"
import { kit } from "../kit"
import { applySplitFrom } from "./apply-split"
import { planClose, planCloseAll, shownSplit, splitOf } from "./split"

// ブックスクリーン: ステージを並べて、ブックを見る・直すスクリーン。渡す値は無い
export const BOOK_SCREEN_DEF = kit.defineScreen({
  id: "book-screen",
  title: "Book screen",
  aiDescription:
    "The screen that shows books in stages (one, or two side by side), where the user reads and edits them.",
  props: z.strictObject({}),
  stages: true,
})

export { ONE_SCREEN } from "./one-screen"

// カレントスクリーン（呼ばれた文脈の、カレントにした順の最後）
const current = (ctx: ScreenCommandContext): OpenScreen | undefined => screensOf(ctx).at(-1)
// 窓を開いたときから開いているスクリーン（コントロールセンター）か
const atStart = (ctx: ScreenCommandContext, screen: OpenScreen | undefined): boolean =>
  screen !== undefined && ctx.catalog.screens.get(screen.def)?.atStart === true
// いちばん最近カレントにした、窓を開いたときから開いているスクリーン（start が true）か、そうでないスクリーン（false）
const recent = (ctx: ScreenCommandContext, start: boolean): OpenScreen | undefined =>
  [...screensOf(ctx)].reverse().find(s => atStart(ctx, s) === start)

// 巣箱のコマンド（ステージのメニューの「コントロールセンター」）。コントロールセンター（窓を開いたときから開いているスクリーン）を見ていなければ、それをカレントスクリーンにし、
// 見ていれば、その前にカレントにしていたスクリーンへ戻す。コントロールセンターがカレントの間は、押された状態
export const SCREEN_TOGGLE = kit.defineScreenCommand({
  id: "screen-toggle",
  title: "Control center",
  run: (ctx, a) => {
    const to = recent(ctx, !atStart(ctx, current(ctx)))
    if (to) storeActionsOf(a).makeScreenCurrent(to.id)
  },
  when: () => true,
  active: ctx => atStart(ctx, current(ctx)),
})

// 上下に分けて見せているか（カレントスクリーンが、分けた並びにある）
const splitting = (ctx: ScreenCommandContext): boolean =>
  shownSplit(
    screensOf(ctx),
    screensOf(ctx).map(s => s.id),
    { id: ctx.arrangement.id, value: arrangementValueIn(ctx) },
  ).length > 0

// 上下に分けている間、ステージを並べないスクリーンがカレントなら、Esc でブラウザの履歴を 1 つ戻す（最後に開いたスクリーンを引っ込める）
export const SPLIT_BACK = kit.defineScreenCommand({
  id: "split-back",
  title: "Close the last opened screen",
  run: (_ctx, a) => a.requestBack(),
  when: ctx => current(ctx)?.stages === false && splitting(ctx),
})

// ブックスクリーンを閉じる（何も開いていないステージ 1 つだけのときのステージの真ん中のボタンと、下の行の頭の閉じる）。前にカレントだったスクリーンへ戻る。
// 上下に分けた並びの中なら、並びから外して閉じる（並びが 1 枚になれば、残った物を窓いっぱいに見せる）。並びにほかのブックスクリーンが残らなければ、
// 並びの物も一緒に閉じる（ブックの横に開いた郵便箱などを、ブックと一緒に引っ込める）。
// 窓の最後の 1 枚は土台が閉じないので、出さない（ブックスクリーンは最初から開いているスクリーンでないので、ほかにスクリーンがあれば閉じられる）
export const BOOK_SCREEN_CLOSE = kit.defineScreenCommand({
  id: "book-screen-close",
  title: "Close screen",
  run: (ctx, a) => {
    const store = storeActionsOf(a)
    const id = calledScreenIdOf(ctx)
    const split = splitOf(screensOf(ctx), arrangementValueIn(ctx))
    const book = (other: string) => screensOf(ctx).find(s => s.id === other)?.def === BOOK_SCREEN_DEF.id
    if (!split.includes(id)) store.closeScreen(id)
    else if (!split.some(other => other !== id && book(other))) applySplitFrom(store, planCloseAll(split))
    else applySplitFrom(store, planClose(split, id))
  },
  when: ctx => ctx.screen.def === BOOK_SCREEN_DEF.id && screensOf(ctx).length > 1,
})

export const SPLIT_KEYS = [
  kit.defineKey({
    id: "split-back-escape",
    key: "Escape",
    command: SPLIT_BACK.id,
    scope: "screen",
  }),
]
export { MAXIMIZERS } from "./maximize-state"
export { SCREEN_FLASH, SPLIT_ROWS } from "./split"
