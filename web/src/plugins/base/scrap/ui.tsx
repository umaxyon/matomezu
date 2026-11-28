// スクラップの見た目の、base の側: 切り抜くダイアログ（ScrapCutDialog.tsx）と、スクラップトレイ（左サイドパネルのタブ）と、それを開くボタン（ScrapTray.tsx）の定義
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftSidePanelTab } from "../left-side-panel/ui"
import { SHEET_LAYERS } from "../workspace/slots"
import { STAGE_SLOTS } from "../workspace/ui"
import { SCRAP_CUT_DIALOG } from "."
import { ScrapCutDialog } from "./ScrapCutDialog"
import { ScrapTrayButton, ScrapTrayView } from "./ScrapTray"
import { SCRAP_TRAY_TAB_ID } from "./tab-id"

export const SCRAP_TRAY_TAB = defineLeftSidePanelTab<typeof SCRAP_TRAY_TAB_ID>({
  id: SCRAP_TRAY_TAB_ID,
  title: kit.message("Scrap tray"),
  scope: "stage",
  opens: [SHEET_LAYERS], // 一覧の絵（ScrapView）が、ページの中身のレイヤーを描く
  view: ScrapTrayView,
})

export const SCRAP_DIALOG_VIEWS = { [SCRAP_CUT_DIALOG.id]: ScrapCutDialog }

export const SCRAP_TRAY_BUTTON = defineWidget({
  id: kit.name("scrap-tray-button"),
  slots: STAGE_SLOTS,
  opens: SCRAP_TRAY_TAB.opens,
  view: ScrapTrayButton,
})

export { type FileDrop, useFileDrop, useFilePasteAt } from "./file-drop"
export { ScrapForm } from "./ScrapForm"
export { ScrapView, type ScrapViewProps } from "./ScrapView"
