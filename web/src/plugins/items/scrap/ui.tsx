// スクラップボックスの見た目
import { definePluginUi } from "../../../plugin-api/ui"
import { SCRAP_BOX, SCRAP_BOX_EDIT_DIALOG, SCRAP_BOX_PLUGIN } from "."
import { EditScrapBoxDialog } from "./ScrapBoxDialog"
import { SCRAP_BOX_ICON, ScrapBoxView } from "./ScrapBoxView"

export const SCRAP_BOX_UI = definePluginUi(SCRAP_BOX_PLUGIN, {
  items: { [SCRAP_BOX.id]: { view: ScrapBoxView, icon: SCRAP_BOX_ICON } },
  dialogViews: { [SCRAP_BOX_EDIT_DIALOG.id]: EditScrapBoxDialog },
})
