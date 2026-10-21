// ブック名のウィジェット: ステージで開いているブックの名前と、押すと出るステージのメニュー（stage.menu）
import { defineWidget } from "../../../ui/layout"
import { STAGE_SLOTS } from "../workspace/ui"
import { BookName } from "./BookName"

export const BOOK_NAME = defineWidget({ id: "book-name", slots: STAGE_SLOTS, menus: ["stage.menu"], view: BookName })
