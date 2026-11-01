// ステージの見た目: ブックの中身を描く枠とレイヤー（紙の面・印刷区画の区切り・ブックのビュー・スタンド）、閉じるボタン、ステージのコマンドのアイコン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { StandLayer } from "../utils/anchors"
import { BOOK_LAYERS, STAGE_BODY } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { CloseButton } from "./CloseButton"
import { STAGE_ICONS } from "./icons"
import { BookContentLayer, PaperLayer, PrintAreaLayer } from "./layers"
import { StageView } from "./StageView"

export const BOOK_VIEW = defineWidget({
  id: kit.name("book-view"),
  slots: [STAGE_BODY],
  opens: [BOOK_LAYERS],
  view: StageView,
})
export const PAPER_LAYER = defineWidget({ id: kit.name("paper-layer"), slots: [BOOK_LAYERS], view: PaperLayer })
export const PRINT_AREA_LAYER = defineWidget({
  id: kit.name("print-area-layer"),
  slots: [BOOK_LAYERS],
  view: PrintAreaLayer,
})
export const BOOK_CONTENT = defineWidget({ id: kit.name("book-content"), slots: [BOOK_LAYERS], view: BookContentLayer })
export const STAND_LAYER = defineWidget({ id: kit.name("stand-layer"), slots: [BOOK_LAYERS], view: StandLayer })
export const CLOSE_BUTTON = defineWidget({ id: kit.name("close-button"), slots: STAGE_SLOTS, view: CloseButton })

export { STAGE_ICONS }
