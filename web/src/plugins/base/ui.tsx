// 土台のプラグインの見た目: ブックを開く・ページを作るダイアログ、画面の骨組みのウィジェット、メニューのアイコン。
// 末尾で、骨組みが描くスロット・ウィジェット・メニューを型の表に書き足す
import { defineWidget } from "../../ui/layout"
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { BookName } from "./BookName"
import { CloseButton } from "./CloseButton"
import { DialogHost } from "./DialogHost"
import { COMMAND_ICONS } from "./icons"
import { NewPageDialog } from "./NewPageDialog"
import { OpenBookDialog } from "./OpenBookDialog"
import { PageTabs } from "./PageTabs"
import { StageView } from "./StageView"
import { ToolboxView } from "./ToolboxView"
import { WorkspaceView } from "./WorkspaceView"

// ステージの列のスロット。どれも、そのステージの id を渡す
export interface StageSlotProps {
  stage: string
}
const STAGE_SLOTS = ["stage.top", "stage.bottom", "stage.corner"] as const

export const WORKSPACE = defineWidget({ id: "workspace", slots: ["app"], view: WorkspaceView })
export const DIALOG_HOST = defineWidget({ id: "dialog-host", slots: ["app"], view: DialogHost })
export const BOOK_VIEW = defineWidget({ id: "book-view", slots: ["stage.body"], view: StageView })
export const TOOLBOX = defineWidget({ id: "toolbox", slots: STAGE_SLOTS, view: ToolboxView })
export const BOOK_NAME = defineWidget({ id: "book-name", slots: STAGE_SLOTS, view: BookName })
export const PAGE_TABS = defineWidget({ id: "page-tabs", slots: STAGE_SLOTS, view: PageTabs })
export const CLOSE_BUTTON = defineWidget({ id: "close-button", slots: STAGE_SLOTS, view: CloseButton })

export const BASE_UI = definePluginUi(BASE, {
  dialogViews: { "book.open": OpenBookDialog, "page.new": NewPageDialog },
  widgets: [WORKSPACE, DIALOG_HOST, BOOK_VIEW, TOOLBOX, BOOK_NAME, PAGE_TABS, CLOSE_BUTTON],
  commandIcons: COMMAND_ICONS,
})

declare module "../../ui/tables" {
  interface SlotTable {
    "stage.top": StageSlotProps
    "stage.body": StageSlotProps
    "stage.bottom": StageSlotProps
    "stage.corner": StageSlotProps
  }
  interface WidgetTable {
    workspace: typeof WORKSPACE
    "dialog-host": typeof DIALOG_HOST
    "book-view": typeof BOOK_VIEW
    toolbox: typeof TOOLBOX
    "book-name": typeof BOOK_NAME
    "page-tabs": typeof PAGE_TABS
    "close-button": typeof CLOSE_BUTTON
  }
  interface MenuTable {
    "stage.menu": true
  }
}
