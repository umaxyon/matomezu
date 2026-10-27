// ステージの見た目: ブックの中身を描く枠、閉じるボタン、ステージのコマンドのアイコン
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_BODY } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { CloseButton } from "./CloseButton"
import { STAGE_ICONS } from "./icons"
import { StageView } from "./StageView"

export const BOOK_VIEW = defineWidget({
  id: kit.name("book-view"),
  slots: [STAGE_BODY],
  view: StageView,
})
export const CLOSE_BUTTON = defineWidget({ id: kit.name("close-button"), slots: STAGE_SLOTS, view: CloseButton })

export { STAGE_ICONS }
