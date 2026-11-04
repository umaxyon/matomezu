// 左ドロワーのウィジェット: 開くボタン（フッタメニューに置く）。入れ物はステージの列が描く（workspace/WorkspaceView.tsx）
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { LeftDrawerButton } from "./LeftDrawerButton"

export const LEFT_DRAWER_BUTTON = defineWidget({
  id: kit.name("left-drawer-button"),
  slots: STAGE_SLOTS,
  view: LeftDrawerButton,
})
