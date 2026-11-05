// base の見た目: 機能ごとのフォルダのダイアログ・ウィジェット・メニューのアイコンを集める。
// 末尾で、骨組みが描くスロット・ウィジェット・メニューを core/catalog.ts に書き足す
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { BOOK_LOOK_DIALOG_VIEWS, BOOK_LOOK_ICONS, BOOK_LOOK_SETTING_VIEWS } from "./book-look/ui"
import { BOOK_NAME, FOOTER_MENU_MINIMAP, HISTORY_BUTTONS, STAGE_MENU_BUTTONS } from "./book-name/ui"
import { BOOK_NEW_DIALOG_VIEWS } from "./book-new/ui"
import { BOOK_OPEN_DIALOG_VIEWS, BOOK_OPEN_ICONS } from "./book-open/ui"
import { MENU_HOST } from "./context-menu/ui"
import { DIALOG_HOST } from "./dialog-host/ui"
import { HISTORY_ICONS } from "./history/icons"
import { LEFT_SIDE_PANEL_BUTTON } from "./left-side-panel/ui"
import { MARK_ICON, MARK_LAYER } from "./mark/ui"
import { NOTE_ICON, NOTE_LAYER, NOTE_PANEL, NOTE_READ_NOTICE } from "./note/ui"
import type { AnnotationIconProps } from "./note-list/slots"
import { NOTE_LIST } from "./note-list/ui"
import { PAGE_DIALOG_VIEWS, PAGE_TABS } from "./page-tabs/ui"
import {
  PRINT_CHECK_PANEL,
  PRINT_PREVIEW_BUTTON,
  PRINT_PREVIEW_PANEL,
  PRINT_PREVIEW_SCROLLBARS,
  PRINT_PREVIEW_SETTING_VIEWS,
} from "./print-preview/ui"
import { SETTINGS_DIALOG_VIEWS, USER_SETTING_VIEWS } from "./settings/ui"
import {
  BOOK_CONTENT,
  BOOK_VIEW,
  CLOSE_BUTTON,
  PAPER_LAYER,
  PRINT_AREA_LAYER,
  PRINT_AREA_TOGGLE,
  STAGE_ICONS,
  STAND_LAYER,
} from "./stage/ui"
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
export { useCloseLeftSidePanel, useLeftSidePanel, useOpenLeftSidePanel } from "./left-side-panel/hooks"
export { LEFT_SIDE_PANEL } from "./left-side-panel/slots"
export { defineLeftSidePanelTab } from "./left-side-panel/ui"
export { useMarkdownDocument } from "./markdown/ui"
export { useDrawnMinimap } from "./minimap/drawn"
export { ANNOTATION_ICON, type AnnotationIconProps } from "./note-list/slots"
export { defineAnnotationIcon } from "./note-list/ui"
export { type PaperValue, usePaperControls } from "./page-tabs/PaperControls"
export { useAddPage } from "./page-tabs/useAddPage"
export type { PrintMeasured, PrintMeasureProps, PrintSheetProps } from "./print-preview/PrintPreviewView"
export {
  useCloseRightSidePanel,
  useFollowsSelection,
  useOpenRightSidePanel,
  useRightSidePanel,
  useSetRightSidePanelCurrent,
} from "./right-side-panel/hooks"
export { RIGHT_SIDE_PANEL } from "./right-side-panel/slots"
export type { RightSidePanelOpen } from "./right-side-panel/state"
export { UserSettings } from "./settings/ui"
export {
  BodyField,
  CaptionField,
  DividerField,
  RichBar,
  RichBody,
  RichInput,
  type RichInputHandle,
  RichText,
  TextBlockView,
  type TextDraft,
  useBodyGrips,
} from "./text/ui"
export * from "./utils/ui"
export { defineWorkspace, STAGE_BASE_SLOTS, type StageSlotProps } from "./workspace/ui"

export const BASE_UI = definePluginUi(BASE, {
  dialogViews: {
    ...BOOK_OPEN_DIALOG_VIEWS,
    ...PAGE_DIALOG_VIEWS,
    ...BOOK_LOOK_DIALOG_VIEWS,
    ...BOOK_NEW_DIALOG_VIEWS,
    ...SETTINGS_DIALOG_VIEWS,
  },
  settingViews: { ...BOOK_LOOK_SETTING_VIEWS, ...TEXT_SETTING_VIEWS, ...PRINT_PREVIEW_SETTING_VIEWS },
  userSettingViews: USER_SETTING_VIEWS,
  widgets: [
    WORKSPACE,
    DIALOG_HOST,
    MENU_HOST,
    TOAST_HOST,
    TOOL_PICKER_WIDGET,
    BOOK_VIEW,
    PAPER_LAYER,
    PRINT_AREA_LAYER,
    BOOK_CONTENT,
    STAND_LAYER,
    NOTE_LAYER,
    NOTE_PANEL,
    MARK_LAYER,
    PRINT_AREA_TOGGLE,
    PRINT_PREVIEW_BUTTON,
    PRINT_PREVIEW_PANEL,
    PRINT_CHECK_PANEL,
    PRINT_PREVIEW_SCROLLBARS,
    LEFT_SIDE_PANEL_BUTTON,
    NOTE_LIST,
    NOTE_READ_NOTICE,
    NOTE_ICON,
    MARK_ICON,
    TOOL_SWITCH,
    TOOLBOX,
    BOOK_NAME,
    FOOTER_MENU_MINIMAP,
    HISTORY_BUTTONS,
    STAGE_MENU_BUTTONS,
    PAGE_TABS,
    CLOSE_BUTTON,
  ],
  commandIcons: { ...STAGE_ICONS, ...ZOOM_ICONS, ...BOOK_OPEN_ICONS, ...BOOK_LOOK_ICONS, ...HISTORY_ICONS },
  toolIcons: TOOL_ICONS,
})

declare module "../../core/catalog" {
  interface SlotTable {
    "@matomezu/base:stage-top": StageSlotProps
    "@matomezu/base:stage-body": StageSlotProps
    "@matomezu/base:book-layers": StageSlotProps
    "@matomezu/base:stage-bottom": StageSlotProps
    "@matomezu/base:stage-corner": StageSlotProps
    "@matomezu/base:footer-menu-map": StageSlotProps
    "@matomezu/base:footer-menu-history": StageSlotProps
    "@matomezu/base:footer-menu-basics": StageSlotProps
    "@matomezu/base:footer-menu-book-tools": StageSlotProps
    "@matomezu/base:right-side-panel": StageSlotProps
    "@matomezu/base:left-side-panel": StageSlotProps
    "@matomezu/base:annotation-icon": AnnotationIconProps
  }
  interface WidgetExtras {
    // 右サイドパネルのスロットに置く中身の幅（px。開いているときの右サイドパネルの幅になる）と、
    // ステージの選択に従うか（followsSelection。従う中身を出している間は、付いた先がステージの選択になり、開いたステージの中を押しても閉じない）
    rightSidePanel?: { width: number; followsSelection?: boolean }
    // 左サイドパネルのスロットに置くタブの名前（文言の鍵）
    leftSidePanel?: { title: MessageKey }
    // 伝言一覧の行の絵のスロットに置く物が描く、アノテーションの種類の id
    annotationIcon?: { annotation: string }
  }
  interface WidgetTable {
    "@matomezu/base:workspace": typeof WORKSPACE
    "@matomezu/base:dialog-host": typeof DIALOG_HOST
    "@matomezu/base:menu-host": typeof MENU_HOST
    "@matomezu/base:toast-host": typeof TOAST_HOST
    "@matomezu/base:tool-picker": typeof TOOL_PICKER_WIDGET
    "@matomezu/base:book-view": typeof BOOK_VIEW
    "@matomezu/base:paper-layer": typeof PAPER_LAYER
    "@matomezu/base:print-area-layer": typeof PRINT_AREA_LAYER
    "@matomezu/base:book-content": typeof BOOK_CONTENT
    "@matomezu/base:stand-layer": typeof STAND_LAYER
    "@matomezu/base:note-layer": typeof NOTE_LAYER
    "@matomezu/base:note-panel": typeof NOTE_PANEL
    "@matomezu/base:mark-layer": typeof MARK_LAYER
    "@matomezu/base:print-area-toggle": typeof PRINT_AREA_TOGGLE
    "@matomezu/base:print-preview-button": typeof PRINT_PREVIEW_BUTTON
    "@matomezu/base:left-side-panel-button": typeof LEFT_SIDE_PANEL_BUTTON
    "@matomezu/base:note-list": typeof NOTE_LIST
    "@matomezu/base:note-read-notice": typeof NOTE_READ_NOTICE
    "@matomezu/base:note-icon": typeof NOTE_ICON
    "@matomezu/base:mark-icon": typeof MARK_ICON
    "@matomezu/base:print-preview-panel": typeof PRINT_PREVIEW_PANEL
    "@matomezu/base:print-check-panel": typeof PRINT_CHECK_PANEL
    "@matomezu/base:print-preview-scrollbars": typeof PRINT_PREVIEW_SCROLLBARS
    "@matomezu/base:tool-switch": typeof TOOL_SWITCH
    "@matomezu/base:toolbox": typeof TOOLBOX
    "@matomezu/base:book-name": typeof BOOK_NAME
    "@matomezu/base:footer-menu-minimap": typeof FOOTER_MENU_MINIMAP
    "@matomezu/base:history-buttons": typeof HISTORY_BUTTONS
    "@matomezu/base:stage-menu-buttons": typeof STAGE_MENU_BUTTONS
    "@matomezu/base:page-tabs": typeof PAGE_TABS
    "@matomezu/base:close-button": typeof CLOSE_BUTTON
  }
  interface MenuTable {
    "@matomezu/base:stage-menu": true
  }
}
