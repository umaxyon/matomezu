// base の見た目: 機能ごとのフォルダのダイアログ・ウィジェット・メニューのアイコンを集める。
// 末尾で、骨組みが描くスロット・ウィジェット・メニューを core/catalog.ts に書き足す
import type { WideSearchHit } from "../../core/wide-search"
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { BOOK_LOOK_DIALOG_VIEWS, BOOK_LOOK_ICONS, BOOK_LOOK_SETTING_VIEWS } from "./book-look/ui"
import { BOOK_NAME, FOOTER_MENU_MINIMAP, HISTORY_BUTTONS, STAGE_MENU_BUTTONS } from "./book-name/ui"
import { BOOK_NEW_DIALOG_VIEWS } from "./book-new/ui"
import { BOOK_OPEN_DIALOG_VIEWS, BOOK_OPEN_ICONS } from "./book-open/ui"
import { MENU_HOST } from "./context-menu/ui"
import { DIALOG_HOST } from "./dialog-host/ui"
import { EDIT_LOCK } from "./edit-lock/ui"
import { HISTORY_ICONS } from "./history/icons"
import type { MailActionsProps } from "./mail/slots"
import {
  MAIL_BOOKMARKS,
  MAIL_DIALOG_VIEWS,
  MAIL_LAYER,
  MAIL_WATCH,
  MAILBOX_BUTTON,
  MAILBOX_TAB,
  PROPOSAL_ACTIONS,
} from "./mail/ui"
import { ALERT_STATUS, MARK_ICON, MARK_LAYER } from "./mark/ui"
import { FOLDED_NOTE_STATUS, NOTE_ICON, NOTE_LAYER, NOTE_PANEL, NOTE_READ_NOTICE, READ_NOTE_STATUS } from "./note/ui"
import type { AnnotationIconProps } from "./outbox/slots"
import { OUTBOX } from "./outbox/ui"
import { PAGE_DIALOG_VIEWS, PAGE_LIST, PAGE_SETTINGS_ICONS, PAGE_TABS } from "./page-tabs/ui"
import { JOIN_REQUEST_ACTIONS, PARTICIPANT_DIALOG_VIEWS } from "./participant/ui"
import {
  PRINT_CHECK_PANEL,
  PRINT_PREVIEW_BUTTON,
  PRINT_PREVIEW_PANEL,
  PRINT_PREVIEW_SCROLLBARS,
  PRINT_PREVIEW_SETTING_VIEWS,
  SHEET_CONTENT,
} from "./print-preview/ui"
import { SEARCH_DIALOG } from "./search/ui"
import { GENERAL_CATEGORY, KEYS_CATEGORY, PLUGINS_CATEGORY } from "./settings/categories"
import { SETTINGS_ICONS } from "./settings/icons"
import { SETTINGS_DIALOG_VIEWS, USER_SETTING_VIEWS } from "./settings/ui"
import {
  BACKGROUND_BAND,
  BACKGROUND_BUTTON,
  BACKGROUND_PRINT_CONTROL,
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
import type { CornerStatusProps } from "./utils/corner"
import type { WideSearchModeProps } from "./wide-search/slots"
import { FULL_TEXT_MODE, WIDE_SEARCH_TAB } from "./wide-search/ui"
import { WINDOW_ICONS } from "./window/icons"
import { CONTROL_CENTER_BIRDHOUSE, ONE_SCREEN_WIDGET, WINDOW } from "./window/ui"
import { WORKSPACE } from "./workspace/ui"
import { ZOOM_ICONS } from "./zoom/icons"

export type { WideSearchAnswer, WideSearchHit, WideSearchQuery } from "../../core/wide-search"
export { BirdWalk } from "./birds/BirdWalk"
export { type CodeSpan, highlightCode } from "./code-highlight/highlight"
export { ColorPicker, type Swatch } from "./dialog-host/ColorPicker"
export { Confirm } from "./dialog-host/Confirm"
export { Dialog } from "./dialog-host/Dialog"
export {
  ActionButton,
  Choices,
  ChoiceText,
  controlClass,
  dividerClass,
  Field,
  Form,
  InheritChoices,
  inlineClass,
  MultiChoices,
  Problem,
  pairClass,
  rowClass,
  Section,
  SelectButton,
  Switch,
  SwitchPanel,
} from "./dialog-host/FormParts"
export {
  ALIGN_ICONS,
  useAligns,
  useBookOf,
  usePageTheme,
  usePageThemes,
  useSwatches,
  useThemeVars,
} from "./item-parts/parts"
export { useCloseLeftSidePanel, useLeftSidePanel, useOpenLeftSidePanel } from "./left-side-panel/hooks"
export { LeftSidePanelOpenButton } from "./left-side-panel/OpenButton"
export { LEFT_SIDE_PANEL } from "./left-side-panel/slots"
export type { LeftSidePanelEntry, LeftSidePanelOpen } from "./left-side-panel/state"
export { defineLeftSidePanelTab, opensOf, tabEntry } from "./left-side-panel/ui"
export { LockToggle } from "./lock/LockToggle"
export { useMailboxPanel } from "./mail/hooks"
export { MAIL_ACTIONS, type MailActionsProps } from "./mail/slots"
export { defineMailActions, MAILBOX_OPENS } from "./mail/ui"
export {
  MARKDOWN_PANE_MODE_ICONS,
  MarkdownDocumentView,
  markdownDocumentOnSkin,
  useMarkdownDocument,
} from "./markdown/ui"
export { useDrawnMinimap } from "./minimap/drawn"
export { ANNOTATION_ICON, type AnnotationIconProps } from "./outbox/slots"
export { defineAnnotationIcon } from "./outbox/ui"
export { PageProblemsView, usePageProblems } from "./page-tabs/PageProblems"
export { type PaperValue, usePaperControls } from "./page-tabs/PaperControls"
export { useAddPage } from "./page-tabs/useAddPage"
export { BirdFaceView } from "./participant/BirdFaceView"
export { useWorkroomActions, useWorkroomRows, type WorkroomActions } from "./participant/hooks"
export type { PrintMeasured, PrintMeasureProps, PrintSheetProps } from "./print-preview/PrintPreviewView"
export { ScrapForm } from "./scrap/ScrapForm"
export { ScrapView, type ScrapViewProps } from "./scrap/ScrapView"
export { ChoiceSetting } from "./settings/ChoiceSetting"
export { useWideSearch, useWideSearchPanel, WIDE_SEARCH_LIMIT_MAX } from "./wide-search/hooks"
export { WIDE_SEARCH_MODES, WIDE_SEARCH_OPENERS, type WideSearchModeProps } from "./wide-search/slots"
export { defineWideSearchMode, defineWideSearchOpener, WIDE_SEARCH_OPENS } from "./wide-search/ui"

import type { PrintSheetProps } from "./print-preview/PrintPreviewView"

export {
  useCloseRightSidePanel,
  useFollowsSelection,
  useOpenRightSidePanel,
  useRightSidePanel,
  useSetRightSidePanelCurrent,
} from "./right-side-panel/hooks"
export { RIGHT_SIDE_PANEL } from "./right-side-panel/slots"
export type { RightSidePanelOpen } from "./right-side-panel/state"
export type { SearchHit } from "./search/find"
export {
  SEARCH_CURRENT_HIGHLIGHT,
  SEARCH_HIGHLIGHT,
  useHighlightRanges,
  useSearchHits,
  useSearchPick,
} from "./search/highlights"
export { defineSettingsCategory } from "./settings/categories"
export { SettingRow } from "./settings/SettingRow"
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
export { useControlCenterMaximize, useControlCenterMaximized } from "./window/maximize"
export {
  BOOK_SCREEN,
  CONTROL_CENTER_FOOTER,
  CONTROL_CENTER_PROJECTS,
  CONTROL_CENTER_SIDE,
  WORKROOM_COLUMNS,
  WORKROOM_ROW_LINE,
} from "./window/slots"
export { defineWorkspace, STAGE_BASE_SLOTS } from "./workspace/ui"

import { SCRAP_DIALOG_VIEWS, SCRAP_TRAY_BUTTON, SCRAP_TRAY_TAB } from "./scrap/ui"
export const BASE_UI = definePluginUi(BASE, {
  dialogViews: {
    ...BOOK_OPEN_DIALOG_VIEWS,
    ...PAGE_DIALOG_VIEWS,
    ...BOOK_LOOK_DIALOG_VIEWS,
    ...BOOK_NEW_DIALOG_VIEWS,
    ...SETTINGS_DIALOG_VIEWS,
    ...MAIL_DIALOG_VIEWS,
    ...PARTICIPANT_DIALOG_VIEWS,
    ...SCRAP_DIALOG_VIEWS,
  },
  settingViews: { ...BOOK_LOOK_SETTING_VIEWS, ...TEXT_SETTING_VIEWS, ...PRINT_PREVIEW_SETTING_VIEWS },
  userSettingViews: USER_SETTING_VIEWS,
  widgets: [
    WINDOW,
    ONE_SCREEN_WIDGET,
    CONTROL_CENTER_BIRDHOUSE,
    WORKSPACE,
    DIALOG_HOST,
    MENU_HOST,
    TOAST_HOST,
    TOOL_PICKER_WIDGET,
    SEARCH_DIALOG,
    BOOK_VIEW,
    PAPER_LAYER,
    PRINT_AREA_LAYER,
    BOOK_CONTENT,
    STAND_LAYER,
    NOTE_LAYER,
    NOTE_PANEL,
    MARK_LAYER,
    PRINT_AREA_TOGGLE,
    BACKGROUND_BAND,
    BACKGROUND_BUTTON,
    BACKGROUND_PRINT_CONTROL,
    PRINT_PREVIEW_BUTTON,
    PRINT_PREVIEW_PANEL,
    PRINT_CHECK_PANEL,
    PRINT_PREVIEW_SCROLLBARS,
    SHEET_CONTENT,
    MAILBOX_BUTTON,
    OUTBOX,
    MAILBOX_TAB,
    SCRAP_TRAY_TAB,
    SCRAP_TRAY_BUTTON,
    MAIL_BOOKMARKS,
    MAIL_WATCH,
    EDIT_LOCK,
    JOIN_REQUEST_ACTIONS,
    PROPOSAL_ACTIONS,
    FULL_TEXT_MODE,
    WIDE_SEARCH_TAB,
    MAIL_LAYER,
    NOTE_READ_NOTICE,
    NOTE_ICON,
    MARK_ICON,
    ALERT_STATUS,
    FOLDED_NOTE_STATUS,
    READ_NOTE_STATUS,
    TOOL_SWITCH,
    TOOLBOX,
    BOOK_NAME,
    FOOTER_MENU_MINIMAP,
    HISTORY_BUTTONS,
    STAGE_MENU_BUTTONS,
    PAGE_TABS,
    PAGE_LIST,
    CLOSE_BUTTON,
    GENERAL_CATEGORY,
    KEYS_CATEGORY,
    PLUGINS_CATEGORY,
  ],
  commandIcons: {
    ...STAGE_ICONS,
    ...ZOOM_ICONS,
    ...BOOK_OPEN_ICONS,
    ...BOOK_LOOK_ICONS,
    ...PAGE_SETTINGS_ICONS,
    ...HISTORY_ICONS,
    ...SETTINGS_ICONS,
    ...WINDOW_ICONS,
  },
  toolIcons: TOOL_ICONS,
})

declare module "../../core/catalog" {
  interface SlotTable {
    "@matomezu/base:control-center-footer": Record<string, never> // コントロールセンターの下の行（何も受け取らない）
    "@matomezu/base:control-center-side": Record<string, never> // コントロールセンターの左の列の、利用者パネルと参加者の一覧の間（何も受け取らない）
    "@matomezu/base:control-center-projects": Record<string, never> // コントロールセンターのプロジェクトの画面の上の領域（何も受け取らない）
    "@matomezu/base:workroom-columns": { workroom: string } // ワークルームの枠の、情報の列の右に並べる列（選んでいるワークルームの id を受け取る）
    "@matomezu/base:workroom-row-line": { workroom: string; admin: boolean } // 参加者の一覧の、参加済みの行の下の 1 行（その行のワークルームの id と、管理者かを受け取る）
    "@matomezu/base:mail-actions": MailActionsProps // 郵便のダイアログの下の行に並べる、その種類のボタンなど
    "@matomezu/base:wide-search-modes": WideSearchModeProps // 横断検索のタブに並べるモード（入力の下のパネル）
    "@matomezu/base:wide-search-openers": Record<string, never> // 種類ごとの、横断検索の当たりの開き方（何も描かない）
    "@matomezu/base:stage-top": Record<string, never>
    "@matomezu/base:stage-side": Record<string, never>
    "@matomezu/base:stage-body": Record<string, never>
    "@matomezu/base:book-layers": Record<string, never>
    "@matomezu/base:sheet-layers": PrintSheetProps // 印刷区画 1 つの中のレイヤー
    "@matomezu/base:stage-bottom": Record<string, never>
    "@matomezu/base:stage-corner": Record<string, never>
    "@matomezu/base:footer-menu-map": Record<string, never>
    "@matomezu/base:footer-menu-history": Record<string, never>
    "@matomezu/base:footer-menu-basics": Record<string, never>
    "@matomezu/base:footer-menu-book-tools": Record<string, never>
    "@matomezu/base:right-side-panel": Record<string, never>
    "@matomezu/base:settings-categories": Record<string, never>
    "@matomezu/base:annotation-icon": AnnotationIconProps
    "@matomezu/base:corner-statuses": CornerStatusProps
  }
  interface WidgetExtras {
    // 右サイドパネルのスロットに置く中身の幅（px。開いているときの右サイドパネルの幅になる）と、
    // ステージの選択に従うか（followsSelection。従う中身を出している間は、付いた先がステージの選択になり、開いたステージの中を押しても閉じない）
    rightSidePanel?: { width: number; followsSelection?: boolean }
    // 左サイドパネルのタブ（どのスロットにも置かない）の名前（文言の鍵）と、開くボタンとタブに出す数（未読など）を読むフック（無ければ出さない）
    // scope は、タブが見せる物の範囲: "stage" なら開いた所のステージの物を見せ（中身はそのステージの中として描かれる）、"window" なら窓に 1 つの物
    leftSidePanel?: { title: MessageKey; useCount?: () => number; scope: "stage" | "window" }
    // 設定カテゴリのスロットに置く物の、左の一覧に出す題名（文言の鍵）と、並べる利用者の設定の項目の id（無ければ中身はウィジェットのビューが描く）
    settingsCategory?: { title: MessageKey; settings?: readonly string[] }
    // 送信トレイの行の絵のスロットに置く物が描く、アノテーションの種類の id
    annotationIcon?: { annotation: string }
    // 郵便のダイアログの下の行のスロットに置く物が描く、郵便の種類の本当の id
    mailActions?: { mail: string }
    // 横断検索のモードのスロットに置く物の、切り替えに出す名前（文言の鍵）
    wideSearchMode?: { title: MessageKey }
    // 横断検索の当たりの開き方のスロットに置く物の、その当たりを開く関数を返すフックと、その名前を画面の物から作る関数を返すフック（任意）。開く種類は、ウィジェットの forKind（種類の持ち主だけが書ける）で引く
    wideSearchOpener?: {
      useOpen: () => (hit: WideSearchHit) => void
      useLabel?: () => (hit: WideSearchHit) => string | undefined
    }
    // コーナーステータスのスロットに置く物の名前（文言の鍵。設定画面の「コーナーステータスの並び」に出す）
    cornerStatus?: { title: MessageKey }
  }
  interface WidgetTable {
    "@matomezu/base:window": typeof WINDOW
    "@matomezu/base:one-screen-view": typeof ONE_SCREEN_WIDGET
    "@matomezu/base:control-center-birdhouse": typeof CONTROL_CENTER_BIRDHOUSE
    "@matomezu/base:workspace": typeof WORKSPACE
    "@matomezu/base:dialog-host": typeof DIALOG_HOST
    "@matomezu/base:menu-host": typeof MENU_HOST
    "@matomezu/base:toast-host": typeof TOAST_HOST
    "@matomezu/base:tool-picker": typeof TOOL_PICKER_WIDGET
    "@matomezu/base:search-dialog": typeof SEARCH_DIALOG
    "@matomezu/base:book-view": typeof BOOK_VIEW
    "@matomezu/base:paper-layer": typeof PAPER_LAYER
    "@matomezu/base:print-area-layer": typeof PRINT_AREA_LAYER
    "@matomezu/base:book-content": typeof BOOK_CONTENT
    "@matomezu/base:stand-layer": typeof STAND_LAYER
    "@matomezu/base:note-layer": typeof NOTE_LAYER
    "@matomezu/base:note-panel": typeof NOTE_PANEL
    "@matomezu/base:mark-layer": typeof MARK_LAYER
    "@matomezu/base:print-area-toggle": typeof PRINT_AREA_TOGGLE
    "@matomezu/base:background-band": typeof BACKGROUND_BAND
    "@matomezu/base:background-button": typeof BACKGROUND_BUTTON
    "@matomezu/base:background-print-control": typeof BACKGROUND_PRINT_CONTROL
    "@matomezu/base:print-preview-button": typeof PRINT_PREVIEW_BUTTON
    "@matomezu/base:mailbox-button": typeof MAILBOX_BUTTON
    "@matomezu/base:outbox": typeof OUTBOX
    "@matomezu/base:mailbox": typeof MAILBOX_TAB
    "@matomezu/base:scrap-tray": typeof SCRAP_TRAY_TAB
    "@matomezu/base:scrap-tray-button": typeof SCRAP_TRAY_BUTTON
    "@matomezu/base:mail-bookmarks": typeof MAIL_BOOKMARKS
    "@matomezu/base:mail-watch": typeof MAIL_WATCH
    "@matomezu/base:edit-lock": typeof EDIT_LOCK
    "@matomezu/base:join-request-actions": typeof JOIN_REQUEST_ACTIONS
    "@matomezu/base:proposal-actions": typeof PROPOSAL_ACTIONS
    "@matomezu/base:wide-search-full-text": typeof FULL_TEXT_MODE
    "@matomezu/base:wide-search": typeof WIDE_SEARCH_TAB
    "@matomezu/base:mail-layer": typeof MAIL_LAYER
    "@matomezu/base:note-read-notice": typeof NOTE_READ_NOTICE
    "@matomezu/base:note-icon": typeof NOTE_ICON
    "@matomezu/base:mark-icon": typeof MARK_ICON
    "@matomezu/base:alert-status": typeof ALERT_STATUS
    "@matomezu/base:folded-note-status": typeof FOLDED_NOTE_STATUS
    "@matomezu/base:read-note-status": typeof READ_NOTE_STATUS
    "@matomezu/base:print-preview-panel": typeof PRINT_PREVIEW_PANEL
    "@matomezu/base:print-check-panel": typeof PRINT_CHECK_PANEL
    "@matomezu/base:print-preview-scrollbars": typeof PRINT_PREVIEW_SCROLLBARS
    "@matomezu/base:sheet-content": typeof SHEET_CONTENT
    "@matomezu/base:tool-switch": typeof TOOL_SWITCH
    "@matomezu/base:toolbox": typeof TOOLBOX
    "@matomezu/base:book-name": typeof BOOK_NAME
    "@matomezu/base:footer-menu-minimap": typeof FOOTER_MENU_MINIMAP
    "@matomezu/base:history-buttons": typeof HISTORY_BUTTONS
    "@matomezu/base:stage-menu-buttons": typeof STAGE_MENU_BUTTONS
    "@matomezu/base:page-tabs": typeof PAGE_TABS
    "@matomezu/base:page-list": typeof PAGE_LIST
    "@matomezu/base:close-button": typeof CLOSE_BUTTON
    "@matomezu/base:settings-general": typeof GENERAL_CATEGORY
    "@matomezu/base:settings-keys": typeof KEYS_CATEGORY
    "@matomezu/base:settings-plugins": typeof PLUGINS_CATEGORY
  }
  interface MenuTable {
    "@matomezu/base:stage-menu": true
  }
}
