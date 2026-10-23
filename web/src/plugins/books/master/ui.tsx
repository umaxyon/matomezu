// マスターのプラグインの見た目: マスターのビューと、ブックを作るダイアログ（各フォルダの見た目を集める）
import { definePluginUi } from "../../../ui/plugin"
import { MASTER_PLUGIN } from "."
import { BOOK_NEW_DIALOG_VIEWS } from "./book-new/ui"
import { MASTER_VIEW } from "./view/ui"

export const MASTER_UI = definePluginUi(MASTER_PLUGIN, {
  presentationViews: { master: MASTER_VIEW },
  dialogViews: BOOK_NEW_DIALOG_VIEWS,
})
