// 左ドロワーのウィジェット: 開くボタン（フッタメニューに置く）と、タブを作る関数。入れ物はステージの列が描く（workspace/WorkspaceView.tsx）
import type { ReactNode } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS, type StageSlotProps } from "../workspace/ui"
import { LeftDrawerButton } from "./LeftDrawerButton"
import { LEFT_DRAWER } from "./slots"

// 左ドロワーのタブのウィジェット: 左ドロワーのスロットに置き、タブの名前 title（文言の鍵）を必ず持つ
export const defineLeftDrawerTab = <const Id extends string>(def: {
  id: Id
  title: MessageKey
  view: (props: StageSlotProps) => ReactNode
}) => defineWidget({ id: def.id, slots: [LEFT_DRAWER], leftDrawer: { title: def.title }, view: def.view })

export const LEFT_DRAWER_BUTTON = defineWidget({
  id: kit.name("left-drawer-button"),
  slots: STAGE_SLOTS,
  view: LeftDrawerButton,
})
