// 印刷プレビューの見た目: 設定の項目のビュー、フッタメニューの開くボタン、右サイドパネルの中身

import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import type { SettingControlProps } from "../../../ui/plugin"
import { ChoiceText } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { RIGHT_SIDE_PANEL } from "../right-side-panel/slots"
import { ChoiceSetting } from "../utils/ChoiceSetting"
import { STAGE_SLOTS } from "../workspace/ui"
import { PrintPreviewButton } from "./PrintPreviewButton"
import { PrintPreviewPanel } from "./PrintPreviewPanel"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"
import { ShownSetting } from "./ShownSetting"
import {
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NUMBERS,
  type SheetFlow,
  type SheetOrder,
} from "./settings"

function FlowSetting(props: SettingControlProps<SheetFlow>) {
  const t = useMessages(kit)
  const options = [
    { value: "column" as const, label: t("Vertical"), icon: <ChoiceText>{t("Vertical")}</ChoiceText> },
    { value: "row" as const, label: t("Horizontal"), icon: <ChoiceText>{t("Horizontal")}</ChoiceText> },
  ]
  return <ChoiceSetting {...props} options={options} />
}

function OrderSetting(props: SettingControlProps<SheetOrder>) {
  const t = useMessages(kit)
  const options = [
    { value: "across" as const, label: t("Across first"), icon: <ChoiceText>{t("Across first")}</ChoiceText> },
    { value: "down" as const, label: t("Down first"), icon: <ChoiceText>{t("Down first")}</ChoiceText> },
  ]
  return <ChoiceSetting {...props} options={options} />
}

export const PRINT_PREVIEW_SETTING_VIEWS = {
  [PRINT_PREVIEW_FLOW.id]: { control: FlowSetting },
  [PRINT_PREVIEW_ORDER.id]: { control: OrderSetting },
  [PRINT_PREVIEW_PAGE_NUMBERS.id]: { control: ShownSetting },
  [PRINT_PREVIEW_BOOK_NAME.id]: { control: ShownSetting },
}

export const PRINT_PREVIEW_BUTTON = defineWidget({
  id: kit.name("print-preview-button"),
  slots: STAGE_SLOTS,
  view: PrintPreviewButton,
})

// 印刷プレビューの右サイドパネルの中身（幅は 280px で固定。選択には従わない）
export const PRINT_PREVIEW_PANEL = defineWidget({
  id: PRINT_PREVIEW_PANEL_ID,
  slots: [RIGHT_SIDE_PANEL],
  rightSidePanel: { width: 280 },
  view: PrintPreviewPanel,
})
