// 中の部品の見た目。中の部品のプラグイン（store/builtin.ts）に、ブックのタイプ・アイテム・ダイアログのビューを結ぶ
import { MATOMEZU } from "../store/builtin"
import { OpenBookDialog } from "./book-search/OpenBookDialog"
import { DrawingView } from "./book-types/DrawingView"
import { MasterView } from "./book-types/MasterView"
import { NewBookDialog } from "./dialog/NewBookDialog"
import { NewPageDialog } from "./dialog/NewPageDialog"
import { BoxView } from "./items/BoxView"
import { BOX_ICON } from "./items/icons"
import { definePluginUi } from "./plugin"

export const MATOMEZU_UI = definePluginUi(MATOMEZU, {
  bookViews: { drawing: DrawingView, master: MasterView },
  items: { "shape.box": { view: BoxView, icon: BOX_ICON } },
  dialogViews: { "book.open": OpenBookDialog, "book.new": NewBookDialog, "page.new": NewPageDialog },
})

export const BUILTIN_UI = [MATOMEZU_UI] as const
