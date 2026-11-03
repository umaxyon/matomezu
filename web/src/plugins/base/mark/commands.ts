// マークのコマンド: 右クリックで押した物（アンカーの付いた物）のそばに、マークの種類を選ぶスタンドを出す。配置の anchorMenu に置く
import { anchorTargetState } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { MARK_ADD } from "."

// マークの種類を選ぶスタンド: 付ける先を持ち、マークのレイヤーが最後の物のそばに出す。選ぶかやめると終わる
export const MARK_PICKER = anchorTargetState("markPicker")

export const MARK_NEW = kit.defineCommand({
  id: "mark-new",
  title: "Show to AI",
  performs: [MARK_ADD.id],
  run: MARK_PICKER.start,
  when: ctx => ctx.book !== null,
})
