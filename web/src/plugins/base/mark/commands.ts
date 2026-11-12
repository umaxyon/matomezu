// マークのコマンド: 右クリックで押した物（アンカーの付いた物）のそばに、マークの種類を選ぶスタンドを出す。UI マッピングの anchorMenu に置く
import { startAnchorTarget } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { MARK_ADD } from "."
import { MARK_PICKER } from "./states"

export const MARK_NEW = kit.defineCommand({
  id: "mark-new",
  title: "Show to AI",
  performs: [MARK_ADD.id],
  run: startAnchorTarget(MARK_PICKER),
  when: ctx => ctx.book !== null,
})
