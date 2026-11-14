// 窓のスクリーンの定義（ブックスクリーン）と、窓のコマンド: カレントスクリーン（ステージを並べないスクリーンかブックスクリーン）の切り替え
import { z } from "zod"
import type { CalledScreen, ScreenCommandContext } from "../../../store/commands/def"
import { kit } from "../kit"

// ブックスクリーン: ステージを並べて、ブックを見る・直すスクリーン。渡す値は無い
export const BOOK_SCREEN_DEF = kit.defineScreen({
  id: "book-screen",
  title: "Book screen",
  aiDescription:
    "The screen that shows books in stages (one, or two side by side), where the user reads and edits them.",
  props: z.strictObject({}),
  stages: true,
})

// スクリーンアレンジメント「1 枚ずつ」: 見えているのは、カレントスクリーンの 1 枚だけ。窓を開いたときのスクリーンアレンジメント。
// ブックスクリーンは動かさず、ステージを並べないスクリーンは右から滑り込み、その間は下の行（巣箱のボタン）を出す（描き方は WindowView）
export const ONE_SCREEN = kit.defineScreenArrangement({
  id: "one-screen",
  title: "One screen at a time",
  aiDescription: "Shows one screen at a time: the current screen. The others stay open behind it, unseen.",
  shown: (_, order) => order.slice(-1),
  atStart: true,
})

// カレントスクリーン（呼ばれた文脈の、カレントにした順の最後）
const current = (ctx: ScreenCommandContext): CalledScreen | undefined => ctx.screens[ctx.screens.length - 1]
// いちばん最近カレントにした、ステージを並べるスクリーン（stages が true）か、並べないスクリーン（false）
const recent = (ctx: ScreenCommandContext, stages: boolean): CalledScreen | undefined =>
  [...ctx.screens].reverse().find(s => s.stages === stages)

// 巣箱のボタン。ブックスクリーンと、ステージを並べないスクリーン（コントロールセンターなど）を行き来する: カレントスクリーンと違う種類の、
// いちばん最近カレントにしたスクリーンをカレントスクリーンにする。ステージを並べないスクリーンがカレントの間は、押された状態
export const CONTROL_CENTER_TOGGLE = kit.defineScreenCommand({
  id: "control-center-toggle",
  title: "Control center",
  run: (ctx, a) => {
    const to = recent(ctx, current(ctx)?.stages !== true)
    if (to) a.makeScreenCurrent(to.id)
  },
  when: () => true,
  active: ctx => current(ctx)?.stages === false,
})

// ステージを並べないスクリーンがカレントの間、Esc でブックスクリーンへ戻る
export const CONTROL_CENTER_LEAVE = kit.defineScreenCommand({
  id: "control-center-leave",
  title: "Back to the book screen",
  run: (ctx, a) => {
    const to = recent(ctx, true)
    if (to) a.makeScreenCurrent(to.id)
  },
  when: ctx => current(ctx)?.stages === false,
})

export const CONTROL_CENTER_KEYS = [
  kit.defineKey({
    id: "control-center-leave-escape",
    key: "Escape",
    command: CONTROL_CENTER_LEAVE.id,
    scope: "screen",
  }),
]
