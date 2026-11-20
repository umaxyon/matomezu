// ブック名のウィジェット: ステージで開いているブックの名前と、乗ると上がるフッタメニュー（中は地図・履歴・基本・ブックの道具のスロット。footer-menu/）
import { defineWidget } from "../../../ui/layout"
import { FOOTER_MENU_SLOTS } from "../footer-menu/footer-menu"
import { kit } from "../kit"
import { STAGE_SLOTS } from "../workspace/ui"
import { BookName } from "./BookName"

export const BOOK_NAME = defineWidget({
  id: kit.name("book-name"),
  slots: STAGE_SLOTS,
  opens: FOOTER_MENU_SLOTS,
  view: BookName,
})
