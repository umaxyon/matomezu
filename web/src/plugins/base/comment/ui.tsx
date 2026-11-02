// コメントの見た目のウィジェット: ブックのレイヤーに置き、開いているブックのコメントと下書きをスタンドで出す。右サイドパネルにはコメントのやり取りを出す
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { RIGHT_SIDE_PANEL } from "../right-side-panel/slots"
import { BOOK_LAYERS } from "../workspace/slots"
import { CommentLayer } from "./CommentLayer"
import { CommentPanel } from "./CommentPanel"
import { COMMENT_THREAD_ID } from "./thread-id"

export const COMMENT_LAYER = defineWidget({ id: kit.name("comment-layer"), slots: [BOOK_LAYERS], view: CommentLayer })

// コメントの右サイドパネルの中身（幅は 320px で固定）
export const COMMENT_THREAD = defineWidget({
  id: COMMENT_THREAD_ID,
  slots: [RIGHT_SIDE_PANEL],
  rightSidePanel: { width: 320 },
  view: CommentPanel,
})
