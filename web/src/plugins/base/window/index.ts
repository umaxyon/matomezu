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
