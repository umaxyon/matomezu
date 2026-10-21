// ページの見た目: ページのタブのウィジェットと、ページを作るダイアログ
import { defineWidget } from "../../../ui/layout"
import { STAGE_SLOTS } from "../workspace/ui"
import { NewPageDialog } from "./NewPageDialog"
import { PageTabs } from "./PageTabs"

export const PAGE_TABS = defineWidget({ id: "page-tabs", slots: STAGE_SLOTS, view: PageTabs })

export const PAGE_DIALOG_VIEWS = { "page.new": NewPageDialog }
