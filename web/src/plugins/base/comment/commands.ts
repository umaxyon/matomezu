// コメントのコマンド: 右クリックで押した物（アンカーの付いた物）に、コメントの下書き（書いている途中のコメント）を始める。配置の anchorMenu に置く
import { anchorTargetState } from "../context-menu/anchor-targets"
import { kit } from "../kit"
import { COMMENT_ADD } from "."

// コメントの下書き: 付ける先を持ち、コメントのレイヤーが最後の物のそばに吹き出しで出す。付けるかやめると終わる
export const COMMENT_DRAFT = anchorTargetState("commentDraft")

export const COMMENT_NEW = kit.defineCommand({
  id: "comment-new",
  title: "Comment",
  performs: [COMMENT_ADD.id],
  run: COMMENT_DRAFT.start,
  when: ctx => ctx.book !== null,
})
