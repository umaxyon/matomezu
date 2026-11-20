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
import { shownSplit } from "./split"

// ブックスクリーン: ステージを並べて、ブックを見る・直すスクリーン。渡す値は無い
export const BOOK_SCREEN_DEF = kit.defineScreen({
  id: "book-screen",
  title: "Book screen",
  aiDescription:
    "The screen that shows books in stages (one, or two side by side), where the user reads and edits them.",
  props: z.strictObject({}),
  stages: true,
  maxOpen: 2,
})

// スクリーンアレンジメント「1 枚ずつ」: 見えているのは、カレントスクリーンの 1 枚だけ。窓を開いたときのスクリーンアレンジメント。
// ブックスクリーンは動かさず、ステージを並べないスクリーンは右から滑り込み、その間は下の行（スロット screen-footer に置いた物があれば）を出す（描き方は WindowView）
export const ONE_SCREEN = kit.defineScreenArrangement({
  id: "one-screen",
  title: "One screen at a time",
  aiDescription: "Shows one screen at a time: the current screen. The others stay open behind it, unseen.",
  shown: (_, order) => order.slice(-1),
  atStart: true,
})

// カレントスクリーン（呼ばれた文脈の、カレントにした順の最後）
const current = (ctx: ScreenCommandContext): OpenScreen | undefined => screensOf(ctx).at(-1)
// いちばん最近カレントにした、ステージを並べるスクリーン（stages が true）か、並べないスクリーン（false）
const recent = (ctx: ScreenCommandContext, stages: boolean): OpenScreen | undefined =>
  [...screensOf(ctx)].reverse().find(s => s.stages === stages)

// 巣箱のコマンド（ステージのメニューの「コントロールセンター」）。ブックスクリーンと、ステージを並べないスクリーン（コントロールセンターなど）を行き来する: カレントスクリーンと違う種類の、
// いちばん最近カレントにしたスクリーンをカレントスクリーンにする。ステージを並べないスクリーンがカレントの間は、押された状態
export const SCREEN_TOGGLE = kit.defineScreenCommand({
  id: "screen-toggle",
  title: "Control center",
  run: (ctx, a) => {
    const to = recent(ctx, current(ctx)?.stages !== true)
    if (to) storeActionsOf(a).makeScreenCurrent(to.id)
  },
  when: () => true,
  active: ctx => current(ctx)?.stages === false,
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

// ブックスクリーンを閉じる（何も開いていないステージ 1 つだけのとき、ステージの真ん中のボタン）。前にカレントだったスクリーンへ戻る。
// 窓の最後の 1 枚は土台が閉じないので、出さない（ブックスクリーンは最初から開いているスクリーンでないので、ほかにスクリーンがあれば閉じられる）
export const BOOK_SCREEN_CLOSE = kit.defineScreenCommand({
  id: "book-screen-close",
  title: "Close screen",
  run: (ctx, a) => storeActionsOf(a).closeScreen(calledScreenIdOf(ctx)),
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
