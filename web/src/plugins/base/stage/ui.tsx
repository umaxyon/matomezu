// ステージの見た目: ブックの中身を描く枠とレイヤー（紙の面・印刷区画の区切り・プレゼンテーションのビュー・スタンド）、閉じるボタン、ステージのコマンドのアイコン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { StandLayer } from "../utils/anchors"
import { CORNER_STATUSES } from "../utils/corner"
import { BOOK_LAYERS, SHEET_LAYERS, STAGE_BODY } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { BackgroundBand, BackgroundButton, BackgroundPrintControl } from "./BackgroundParts"
import { CloseButton } from "./CloseButton"
import { STAGE_ICONS } from "./icons"
import { BookContentLayer, PaperLayer, PrintAreaLayer } from "./layers"
import { PrintAreaToggle } from "./PrintAreaToggle"
import { StageView } from "./StageView"

export const BOOK_VIEW = defineWidget({
  id: kit.name("book-view"),
  slots: [STAGE_BODY],
  opens: [BOOK_LAYERS, SHEET_LAYERS, CORNER_STATUSES], // 印刷プレビューと刷る物は、このステージのビューが描く
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
export const PRINT_AREA_TOGGLE = defineWidget({
  id: kit.name("print-area-toggle"),
  slots: STAGE_SLOTS,
  view: PrintAreaToggle,
})
export const BACKGROUND_BAND = defineWidget({
  id: kit.name("background-band"),
  slots: [BOOK_LAYERS],
  view: BackgroundBand,
})
export const BACKGROUND_BUTTON = defineWidget({
  id: kit.name("background-button"),
  slots: STAGE_SLOTS,
  view: BackgroundButton,
})
export const BACKGROUND_PRINT_CONTROL = defineWidget({
  id: kit.name("background-print-control"),
  slots: STAGE_SLOTS,
  view: BackgroundPrintControl,
})
export const CLOSE_BUTTON = defineWidget({ id: kit.name("close-button"), slots: STAGE_SLOTS, view: CloseButton })

export { STAGE_ICONS }
