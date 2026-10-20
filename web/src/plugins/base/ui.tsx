// 土台のプラグインの見た目: マスターのビューと、ブックを開く・作る、ページを作るダイアログ
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { MasterView } from "./MasterView"
import { NewBookDialog } from "./NewBookDialog"
import { NewPageDialog } from "./NewPageDialog"
import { OpenBookDialog } from "./OpenBookDialog"

export const BASE_UI = definePluginUi(BASE, {
  bookViews: { master: MasterView },
  dialogViews: { "book.open": OpenBookDialog, "book.new": NewBookDialog, "page.new": NewPageDialog },
})
