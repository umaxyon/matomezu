// マークの見た目のウィジェット: ブックのレイヤーに置き、開いているブックのマークと、マークの種類を選ぶ所をスタンドで出す
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { BOOK_LAYERS } from "../workspace/slots"
import { MarkLayer } from "./MarkLayer"

export const MARK_LAYER = defineWidget({ id: kit.name("mark-layer"), slots: [BOOK_LAYERS], view: MarkLayer })
