// 伝言のコマンド: 右クリックで押した物（アンカーの付いた物）に、伝言の下書き（書いている途中の伝言）を始める。配置の anchorMenu に置く

import { anchorTargetState } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { NOTE_ADD } from "."

// 伝言の下書き: 付ける先を持ち、伝言のレイヤーが最後の物のそばに吹き出しで出す。付けるかやめると終わる
export const NOTE_DRAFT = anchorTargetState("noteDraft")

export const NOTE_NEW = kit.defineCommand({
  id: "note-new",
  title: "Note to AI",
  performs: [NOTE_ADD.id],
  run: NOTE_DRAFT.start,
  when: ctx => ctx.book !== null,
})
