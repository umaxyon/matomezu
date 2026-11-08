// 窓のコマンド: 前に出す物（コントロールセンターかブックスクリーン）の切り替え
import { kit } from "../kit"

// 止まり木のボタン。コントロールセンターを前に出し、コントロールセンターを前に出している間は押すとブックスクリーンへ戻る
export const CONTROL_CENTER_TOGGLE = kit.defineCommand({
  id: "control-center-toggle",
  title: "Control center",
  run: (ctx, a) => (ctx.front === "control-center" ? a.showBookScreen() : a.showControlCenter()),
  when: () => true,
  active: ctx => ctx.front === "control-center",
})
