// base の見た目: 機能ごとのフォルダのダイアログ・ウィジェット・メニューのアイコンを集める。
// 末尾で、骨組みが描くスロット・ウィジェット・メニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { BOOK_LOOK_DIALOG_VIEWS, BOOK_LOOK_ICONS, BOOK_LOOK_SETTING_VIEWS } from "./book-look/ui"
import { BOOK_NAME } from "./book-name/ui"
import { BOOK_NEW_DIALOG_VIEWS } from "./book-new/ui"
import { BOOK_OPEN_DIALOG_VIEWS, BOOK_OPEN_ICONS } from "./book-open/ui"
import { MENU_HOST } from "./context-menu/ui"
import { DIALOG_HOST } from "./dialog-host/ui"
import { PAGE_DIALOG_VIEWS, PAGE_TABS } from "./page-tabs/ui"
import { USER_SETTING_VIEWS } from "./settings/ui"
import { BOOK_VIEW, CLOSE_BUTTON, STAGE_ICONS } from "./stage/ui"
import { TEXT_SETTING_VIEWS } from "./text/ui"
import { TOAST_HOST } from "./toast-host/ui"
import { TOOL_PICKER_WIDGET } from "./tool-picker/ui"
import { TOOL_ICONS } from "./tool-switch/icons"
import { TOOL_SWITCH } from "./tool-switch/ui"
import { TOOLBOX } from "./toolbox/ui"
import { type StageSlotProps, WORKSPACE } from "./workspace/ui"
import { ZOOM_ICONS } from "./zoom/icons"

export { ColorPicker, type Swatch } from "./dialog-host/ColorPicker"
export { Confirm } from "./dialog-host/Confirm"
export { Dialog } from "./dialog-host/Dialog"
export {
  ActionButton,
  Choices,
  controlClass,
  dividerClass,
  Field,
  Form,
  InheritChoices,
  inlineClass,
  Problem,
  pairClass,
  rowClass,
  Section,
  SelectButton,
  Switch,
  SwitchPanel,
} from "./dialog-host/FormParts"
export { ALIGN_ICONS, useAligns, useBookOf, useBookTheme, useSwatches, useThemeVars } from "./item-parts/parts"
export { UserSettings } from "./settings/ui"
export { RichBar, RichBody, RichText } from "./text/ui"
export * from "./utils/ui"
export { defineWorkspace, STAGE_BASE_SLOTS, type StageSlotProps } from "./workspace/ui"

export const BASE_UI = definePluginUi(BASE, {
  dialogViews: { ...BOOK_OPEN_DIALOG_VIEWS, ...PAGE_DIALOG_VIEWS, ...BOOK_LOOK_DIALOG_VIEWS, ...BOOK_NEW_DIALOG_VIEWS },
  settingViews: { ...BOOK_LOOK_SETTING_VIEWS, ...TEXT_SETTING_VIEWS },
  userSettingViews: USER_SETTING_VIEWS,
  widgets: [
    WORKSPACE,
    DIALOG_HOST,
    MENU_HOST,
    TOAST_HOST,
    TOOL_PICKER_WIDGET,
    BOOK_VIEW,
    TOOL_SWITCH,
    TOOLBOX,
    BOOK_NAME,
    PAGE_TABS,
    CLOSE_BUTTON,
  ],
  commandIcons: { ...STAGE_ICONS, ...ZOOM_ICONS, ...BOOK_OPEN_ICONS, ...BOOK_LOOK_ICONS },
  toolIcons: TOOL_ICONS,
})

declare module "../../core/catalog" {
  interface SlotTable {
    "@matomezu/base:stage-top": StageSlotProps
    "@matomezu/base:stage-body": StageSlotProps
    "@matomezu/base:stage-bottom": StageSlotProps
    "@matomezu/base:stage-corner": StageSlotProps
  }
  interface WidgetTable {
    "@matomezu/base:workspace": typeof WORKSPACE
    "@matomezu/base:dialog-host": typeof DIALOG_HOST
    "@matomezu/base:menu-host": typeof MENU_HOST
    "@matomezu/base:toast-host": typeof TOAST_HOST
    "@matomezu/base:tool-picker": typeof TOOL_PICKER_WIDGET
    "@matomezu/base:book-view": typeof BOOK_VIEW
    "@matomezu/base:tool-switch": typeof TOOL_SWITCH
    "@matomezu/base:toolbox": typeof TOOLBOX
    "@matomezu/base:book-name": typeof BOOK_NAME
    "@matomezu/base:page-tabs": typeof PAGE_TABS
    "@matomezu/base:close-button": typeof CLOSE_BUTTON
  }
  interface MenuTable {
    "@matomezu/base:stage-menu": true
  }
}
