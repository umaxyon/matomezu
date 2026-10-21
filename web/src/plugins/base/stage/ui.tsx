// ステージの見た目: ブックの中身を描く枠、閉じるボタン、ステージのコマンドのアイコン
import { defineWidget } from "../../../ui/layout"
import { STAGE_SLOTS } from "../workspace/ui"
import { CloseButton } from "./CloseButton"
import { STAGE_ICONS } from "./icons"
import { StageView } from "./StageView"

export const BOOK_VIEW = defineWidget({ id: "book-view", slots: ["stage.body"], view: StageView })
export const CLOSE_BUTTON = defineWidget({ id: "close-button", slots: STAGE_SLOTS, view: CloseButton })

export { STAGE_ICONS }
