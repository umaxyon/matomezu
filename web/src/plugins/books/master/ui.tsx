// マスターのプラグインの見た目: マスターのビュー
import { definePluginUi } from "../../../plugin-api/ui"
import { MASTER_PLUGIN } from "."
import { MASTER_VIEW } from "./view/ui"

export const MASTER_UI = definePluginUi(MASTER_PLUGIN, {
  presentationViews: { "@matomezu/master:master": MASTER_VIEW },
})
