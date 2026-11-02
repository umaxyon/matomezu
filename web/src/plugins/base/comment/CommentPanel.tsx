// コメントの右サイドパネルの中身（ウィジェット comment-thread）: 右サイドパネルが自分を開いているときだけ、見せているコメントのやり取りを出す。
// そのコメントが無くなったら（AI が消したなど）、黙って右サイドパネルを閉じる
import { useEffect } from "react"
import { useAnnotationsOf } from "../annotation-hooks"
import { useCloseRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import type { StageSlotProps } from "../workspace/ui"
import { COMMENT, type CommentProps } from "."
import { CommentThread } from "./CommentLayer"
import styles from "./CommentLayer.module.css"
import { COMMENT_THREAD_ID } from "./thread-id"

export function CommentPanel({ stage }: StageSlotProps) {
  const open = useRightSidePanel(stage)
  const comments = useAnnotationsOf(stage, COMMENT.id)
  const close = useCloseRightSidePanel()
  const mine = open?.panel === COMMENT_THREAD_ID
  const comment = mine ? comments.find(c => c.id === open.subject) : undefined
  const gone = mine && !comment
  useEffect(() => {
    if (gone) close(stage)
  }, [gone, close, stage])
  if (!comment) return null
  return (
    <div className={styles.thread}>
      <CommentThread stage={stage} id={comment.id} props={comment.props as CommentProps} />
    </div>
  )
}
