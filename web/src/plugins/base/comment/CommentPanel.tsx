// コメントの右サイドパネルの中身（ウィジェット comment-thread）: 右サイドパネルが見せているコメントのやり取りを出す（入れ物は、開いている中身が自分のときだけ描く）。
// そのコメントが無くなったら（AI が消したなど）、黙って右サイドパネルを閉じる
import { useEffect } from "react"
import { useAnnotationsOf } from "../annotation-hooks"
import { useCloseRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import type { StageSlotProps } from "../workspace/ui"
import { COMMENT, type CommentProps } from "."
import styles from "./CommentLayer.module.css"
import { CommentThread } from "./CommentThread"

export function CommentPanel({ stage }: StageSlotProps) {
  const open = useRightSidePanel(stage)
  const comments = useAnnotationsOf(stage, COMMENT.id)
  const close = useCloseRightSidePanel()
  const comment = open ? comments.find(c => c.id === open.subject) : undefined
  const gone = !!open && !comment
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
