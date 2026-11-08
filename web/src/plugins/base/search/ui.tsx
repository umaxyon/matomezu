// 検索の見た目: 検索ダイアログのウィジェット（根のスロット）
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { SearchDialogHost } from "./SearchDialog"

export const SEARCH_DIALOG = defineWidget({ id: kit.name("search-dialog"), slots: ["root"], view: SearchDialogHost })
