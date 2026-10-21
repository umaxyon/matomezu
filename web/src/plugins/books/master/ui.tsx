// マスターのプラグインの見た目: マスターのビューと、ブックを作るダイアログ
import { definePluginUi } from "../../../ui/plugin"
import { MASTER_PLUGIN } from "."
import { MasterView } from "./MasterView"
import { NewBookDialog } from "./NewBookDialog"

export const MASTER_UI = definePluginUi(MASTER_PLUGIN, {
  bookViews: { master: MasterView },
  dialogViews: { "book.new": NewBookDialog },
})
