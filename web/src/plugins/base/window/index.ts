// 窓のスクリーンの定義（ブックスクリーン）と、窓のコマンド: 前に出す物（ステージを並べないスクリーンかブックスクリーン）の切り替え
import { z } from "zod"
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
// ブックスクリーンは動かさず、ステージを並べないスクリーンは右から滑り込み、その間は下の行（止まり木）を出す（描き方は WindowView）
export const ONE_SCREEN = kit.defineScreenArrangement({
  id: "one-screen",
  title: "One screen at a time",
  aiDescription: "Shows one screen at a time: the current screen. The others stay open behind it, unseen.",
  shown: (_, order) => order.slice(-1),
  atStart: true,
})

// 止まり木のボタン。コントロールセンターを前に出し、コントロールセンターを前に出している間は押すとブックスクリーンへ戻る
export const CONTROL_CENTER_TOGGLE = kit.defineCommand({
  id: "control-center-toggle",
  title: "Control center",
  run: (ctx, a) => (ctx.front === "control-center" ? a.showBookScreen() : a.showControlCenter()),
  when: () => true,
  active: ctx => ctx.front === "control-center",
})

// センターを前に出している間、Esc でブックスクリーンへ戻る
export const CONTROL_CENTER_LEAVE = kit.defineCommand({
  id: "control-center-leave",
  title: "Back to the book screen",
  run: (_, a) => a.showBookScreen(),
  when: ctx => ctx.front === "control-center",
})

export const CONTROL_CENTER_KEYS = [
  kit.defineKey({
    id: "control-center-leave-escape",
    key: "Escape",
    command: CONTROL_CENTER_LEAVE.id,
    scope: "control-center",
  }),
]
