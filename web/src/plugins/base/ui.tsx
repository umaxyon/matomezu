// 土台のプラグインの見た目: 機能ごとのフォルダのダイアログ・ウィジェット・メニューのアイコンを集める。
// 末尾で、骨組みが描くスロット・ウィジェット・メニューを型の表に書き足す
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { BOOK_NAME } from "./book-name/ui"
import { BOOK_OPEN_DIALOG_VIEWS, BOOK_OPEN_ICONS } from "./book-open/ui"
import { MENU_HOST } from "./context-menu/ui"
import { DIALOG_HOST } from "./dialog-host/ui"
import { PAGE_DIALOG_VIEWS, PAGE_TABS } from "./page-tabs/ui"
import { BOOK_VIEW, CLOSE_BUTTON, STAGE_ICONS } from "./stage/ui"
import { TOOL_PICKER_WIDGET } from "./tool-picker/ui"
import { TOOL_SWITCH } from "./tool-switch/ui"
import { TOOLBOX } from "./toolbox/ui"
import { type StageSlotProps, WORKSPACE } from "./workspace/ui"

export { Dialog } from "./dialog-host/Dialog"
export { ActionButton, Choices, controlClass, Field, Form, Problem, rowClass, Switch } from "./dialog-host/FormParts"
export { defineWorkspace, STAGE_BASE_SLOTS, type StageSlotProps } from "./workspace/ui"

export const BASE_UI = definePluginUi(BASE, {
  dialogViews: { ...BOOK_OPEN_DIALOG_VIEWS, ...PAGE_DIALOG_VIEWS },
  widgets: [
    WORKSPACE,
    DIALOG_HOST,
    MENU_HOST,
    TOOL_PICKER_WIDGET,
    BOOK_VIEW,
    TOOL_SWITCH,
    TOOLBOX,
    BOOK_NAME,
    PAGE_TABS,
    CLOSE_BUTTON,
  ],
  commandIcons: { ...STAGE_ICONS, ...BOOK_OPEN_ICONS },
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
    "menu-host": typeof MENU_HOST
    "tool-picker": typeof TOOL_PICKER_WIDGET
    "book-view": typeof BOOK_VIEW
    "tool-switch": typeof TOOL_SWITCH
    toolbox: typeof TOOLBOX
    "book-name": typeof BOOK_NAME
    "page-tabs": typeof PAGE_TABS
    "close-button": typeof CLOSE_BUTTON
  }
  interface MenuTable {
    "stage.menu": true
  }
}
