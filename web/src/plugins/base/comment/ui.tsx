// コメントの見た目のウィジェット: ブックのレイヤーに置き、開いているブックのコメントと下書きをスタンドで出す
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { BOOK_LAYERS } from "../workspace/slots"
import { CommentLayer } from "./CommentLayer"

export const COMMENT_LAYER = defineWidget({ id: kit.name("comment-layer"), slots: [BOOK_LAYERS], view: CommentLayer })
