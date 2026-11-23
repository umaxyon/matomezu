// base の見た目: 機能ごとのフォルダのダイアログ・ウィジェット・メニューのアイコンを集める。
// 末尾で、骨組みが描くスロット・ウィジェット・メニューを core/catalog.ts に書き足す
import "./scrollbar/ui" // 窓の中の全部のスクロールバーを細くする（全体に効く指定）
import type { Point } from "../../core/geom"
import type { WideSearchHit } from "../../core/wide-search"
import { definePluginUi } from "../../ui/plugin"
import { BASE } from "."
import { BOOK_LOOK_DIALOG_VIEWS, BOOK_LOOK_ICONS, BOOK_LOOK_SETTING_VIEWS } from "./book-look/ui"
import { BOOK_NAME } from "./book-name/ui"
import { BOOK_NEW_DIALOG_VIEWS } from "./book-new/ui"
import { BOOKMARK_HOST, type BookmarksProps } from "./bookmarks/ui"
import { MENU_HOST } from "./context-menu/ui"
import type { CornerStatusProps } from "./corner-status/ui"
import { DIALOG_HOST } from "./dialog-host/ui"
import { EDIT_LOCK } from "./edit-lock/ui"
import { FOOTER_MENU_MINIMAP, HISTORY_BUTTONS, STAGE_MENU_BUTTONS } from "./footer-menu/ui"
import { HISTORY_ICONS } from "./history/ui"
import {
  LIBRARY_COMMAND_ICONS,
  LIBRARY_NEW_BOOK_DIALOG,
  LIBRARY_NEW_FOLDER_DIALOG,
  LIBRARY_RENAME_DIALOG,
  LIBRARY_SCREEN_VIEW,
  LibraryNewBookDialog,
  LibraryNewFolderDialog,
  LibraryRenameDialog,
  PAGE_PLACE,
  UNREADABLE_NOTICE,
} from "./library/ui"
import type { MailActionsProps } from "./mail/ui"
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
import { OPEN_GUIDE } from "./open-guide/ui"
import type { AnnotationIconProps } from "./outbox/ui"
import { OUTBOX } from "./outbox/ui"
import { PAGE_CONTEXT_MENU_ROWS, PAGE_DIALOG_VIEWS, PAGE_LIST, PAGE_SETTINGS_ICONS, PAGE_TABS } from "./page-tabs/ui"
import { JOIN_REQUEST_BOOKMARKS, JOIN_REQUEST_WATCH, PARTICIPANT_DIALOG_VIEWS } from "./participant/ui"
import {
  PRINT_CHECK_PANEL,
  PRINT_PREVIEW_BUTTON,
  PRINT_PREVIEW_PANEL,
  PRINT_PREVIEW_SCROLLBARS,
  PRINT_PREVIEW_SETTING_VIEWS,
  SHEET_CONTENT,
} from "./print-preview/ui"
import { SEARCH_DIALOG } from "./search/ui"
import {
  GENERAL_CATEGORY,
  KEYS_CATEGORY,
  PLUGINS_CATEGORY,
  SETTINGS_DIALOG_VIEWS,
  SETTINGS_ICONS,
  USER_SETTING_VIEWS,
} from "./settings/ui"
import {
  BACKGROUND_BAND,
  BACKGROUND_BUTTON,
  BACKGROUND_PRINT_CONTROL,
  BOOK_CONTENT,
  BOOK_VIEW,
  FOOTER_CLOSE_BUTTON,
  FOOTER_WIDEN_BUTTON,
  PAPER_LAYER,
  PRINT_AREA_LAYER,
  PRINT_AREA_TOGGLE,
  STAGE_ICONS,
  STAND_LAYER,
} from "./stage/ui"
import { STARTUP_ERROR } from "./startup-error/ui"
import { TEXT_SETTING_VIEWS } from "./text/ui"
import { TOAST_HOST } from "./toast-host/ui"
import { TOOL_PICKER_WIDGET } from "./tool-picker/ui"
import { TOOL_ICONS, TOOL_SWITCH } from "./tool-switch/ui"
import { TOOLBOX } from "./toolbox/ui"
import { STALE_BUILD, UPDATE_CATEGORY } from "./update/ui"
import type { WideSearchModeProps, WideSearchOpened } from "./wide-search/ui"
import { FULL_TEXT_MODE, WIDE_SEARCH_TAB } from "./wide-search/ui"
import { SCREENS_WIDGET, WINDOW, WINDOW_ICONS } from "./window/ui"
import { WORKSPACE } from "./workspace/ui"
import { ZOOM_ICONS } from "./zoom/ui"

export { BirdWalk } from "./birds/ui"
export {
  BOOKMARKS,
  type Bookmark,
  type BookmarkTone,
  defineBookmarks,
  LETTER_ICON,
  useShowBookmarks,
} from "./bookmarks/ui"
export { type CodeSpan, highlightCode } from "./code-highlight/ui"
export {
  AtCorner,
  CORNER_STATUSES,
  type CornerStatusProps,
  defineCornerStatus,
  useAtCornerBubble,
} from "./corner-status/ui"
export {
  ActionButton,
  Choices,
  ChoiceText,
  ColorPicker,
  Confirm,
  controlClass,
  Dialog,
  dividerClass,
  Field,
  Form,
  InheritChoices,
  inlineClass,
  MultiChoices,
  Notice,
  Problem,
  pairClass,
  rowClass,
  Section,
  SelectButton,
  type Swatch,
  Switch,
  SwitchPanel,
} from "./dialog-host/ui"
export {
  ALIGN_ICONS,
  useAligns,
  useOutermostOf,
  usePageTheme,
  usePageThemes,
  useSwatches,
  useThemeVars,
} from "./item-parts/ui"
export type { LeftSidePanelEntry, LeftSidePanelOpen } from "./left-side-panel/ui"
export {
  defineLeftSidePanelTab,
  LEFT_SIDE_PANEL,
  LeftSidePanelOpenButton,
  opensOf,
  tabEntry,
  useCloseLeftSidePanel,
  useLeftSidePanel,
  useOpenLeftSidePanel,
} from "./left-side-panel/ui"
export { type FolderEntry, LIBRARY_CONTEXT_MENUS, LibraryView, useFolderEntries } from "./library/ui"
export { LockToggle } from "./lock/ui"
export { defineMailActions, MAIL_ACTIONS, MAILBOX_OPENS, type MailActionsProps, useMailboxPanel } from "./mail/ui"
export {
  MARKDOWN_PANE_MODE_ICONS,
  MarkdownDocumentView,
  markdownDocumentOnSkin,
  useMarkdownDocument,
} from "./markdown/ui"
export { useDrawnMinimap } from "./minimap/ui"
export { ANNOTATION_ICON, type AnnotationIconProps, defineAnnotationIcon } from "./outbox/ui"
export {
  PageProblemsView,
  PageSettingsDialogView,
  type PageSettingsDialogViewProps,
  type PaperValue,
  useNewPage,
  usePageProblems,
  usePaperControls,
} from "./page-tabs/ui"
export {
  AdminCrown,
  BirdFaceView,
  CrownIcon,
  useOwnBookPages,
  useVisitorRows,
  useWorkerBook,
  useWorkroomActions,
  useWorkroomRows,
  useWorkroomWorkerBook,
  VisitorIcon,
  WorkerBookPages,
  type WorkroomActions,
} from "./participant/ui"
export type { PrintMeasured, PrintMeasureProps, PrintSheetProps } from "./print-preview/ui"
export { ScrapForm, ScrapView, type ScrapViewProps } from "./scrap/ui"
export { ChoiceSetting } from "./settings/ui"
export {
  type Revealable,
  Stand,
  type StandAway,
  type StandSide,
  useAnchorRef,
  useAnchorShapeRef,
  useRevealable,
  useStandAway,
} from "./stand/ui"
export {
  defineWideSearchMode,
  defineWideSearchOpener,
  useWideSearch,
  useWideSearchPanel,
  WIDE_SEARCH_LIMIT_MAX,
  WIDE_SEARCH_MODES,
  WIDE_SEARCH_OPENERS,
  WIDE_SEARCH_OPENS,
  type WideSearchModeProps,
  type WideSearchOpened,
} from "./wide-search/ui"
export { useCopyText, useMatomezuCommand, useWindowTitle } from "./window-io/ui"

import type { PrintSheetProps } from "./print-preview/ui"

// ページの設定の項目とステージエントリが持つ設定の項目のコンポーネントの並び（ページのタイプの設定のダイアログが使う）
export { type SettingsPatch, useSettingControls } from "./book-settings/ui"
export {
  type FoundHost,
  type HostPairing,
  type HostPeers,
  type HostRequest,
  type HostStatus,
  type PeerLive,
  useAskHosts,
  useHostPeers,
  useHostStatus,
} from "./host/ui"
export type { RightSidePanelOpen } from "./right-side-panel/ui"
export {
  RIGHT_SIDE_PANEL,
  useCloseRightSidePanel,
  useFollowsSelection,
  useOpenRightSidePanel,
  useRightSidePanel,
  useSetRightSidePanelCurrent,
} from "./right-side-panel/ui"
export type { SearchHit } from "./search/ui"
export {
  SEARCH_CURRENT_HIGHLIGHT,
  SEARCH_HIGHLIGHT,
  useHighlightRanges,
  useSearchHits,
  useSearchPick,
} from "./search/ui"
export {
  defineSettingsCategory,
  SettingRow,
  TextSettingControl,
  UserSettings,
  useOpenSettings,
  useUserName,
} from "./settings/ui"
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
  useEndWhenBlocked,
  useInPlaceInput,
} from "./text/ui"
export { useUpdateStatus } from "./update/ui"
export * from "./utils/ui"
export {
  BOOK_SCREEN,
  type BookOpenChoiceOptions,
  type BookShower,
  SCREEN_FOOTER,
  type ScreenSplit,
  useBookOpenChoice,
  useControlCenterMaximize,
  useControlCenterMaximized,
  useScreenSplit,
  useShowBook,
  useShowControlCenter,
} from "./window/ui"
export { defineWorkspace, STAGE_BASE_SLOTS } from "./workspace/ui"

import { SCRAP_DIALOG_VIEWS, SCRAP_TRAY_BUTTON, SCRAP_TRAY_TAB } from "./scrap/ui"
export const BASE_UI = definePluginUi(BASE, {
  dialogViews: {
    ...PAGE_DIALOG_VIEWS,
    ...BOOK_LOOK_DIALOG_VIEWS,
    ...BOOK_NEW_DIALOG_VIEWS,
    [LIBRARY_NEW_BOOK_DIALOG.id]: LibraryNewBookDialog,
    [LIBRARY_NEW_FOLDER_DIALOG.id]: LibraryNewFolderDialog,
    [LIBRARY_RENAME_DIALOG.id]: LibraryRenameDialog,
    ...SETTINGS_DIALOG_VIEWS,
    ...MAIL_DIALOG_VIEWS,
    ...PARTICIPANT_DIALOG_VIEWS,
    ...SCRAP_DIALOG_VIEWS,
  },
  settingViews: { ...BOOK_LOOK_SETTING_VIEWS, ...TEXT_SETTING_VIEWS, ...PRINT_PREVIEW_SETTING_VIEWS },
  userSettingViews: USER_SETTING_VIEWS,
  widgets: [
    WINDOW,
    SCREENS_WIDGET,
    LIBRARY_SCREEN_VIEW,
    WORKSPACE,
    DIALOG_HOST,
    MENU_HOST,
    TOAST_HOST,
    STALE_BUILD,
    UPDATE_CATEGORY,
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
    BOOKMARK_HOST,
    MAIL_BOOKMARKS,
    MAIL_WATCH,
    JOIN_REQUEST_BOOKMARKS,
    JOIN_REQUEST_WATCH,
    EDIT_LOCK,
    OPEN_GUIDE,
    STARTUP_ERROR,
    UNREADABLE_NOTICE,
    PAGE_PLACE,
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
    FOOTER_CLOSE_BUTTON,
    FOOTER_WIDEN_BUTTON,
    GENERAL_CATEGORY,
    KEYS_CATEGORY,
    PLUGINS_CATEGORY,
  ],
  contextMenuRows: PAGE_CONTEXT_MENU_ROWS,
  commandIcons: {
    ...STAGE_ICONS,
    ...ZOOM_ICONS,
    ...BOOK_LOOK_ICONS,
    ...PAGE_SETTINGS_ICONS,
    ...HISTORY_ICONS,
    ...LIBRARY_COMMAND_ICONS,
    ...SETTINGS_ICONS,
    ...WINDOW_ICONS,
  },
  toolIcons: TOOL_ICONS,
})

declare module "../../core/catalog" {
  interface ContextMenuTable {
    // 書庫の画面の行（右クリックしたエントリの id）と、右の枠の何も無い所（開いているフォルダの id）。pressed は、押した画面の位置
    "@matomezu/base:library-entry-context": { entry: string; pressed: Point }
    "@matomezu/base:library-folder-context": { folder: string; pressed: Point }
    "@matomezu/base:library-add-page-menu": { folder: string } // ページを作る先のフォルダの id
  }
  interface SlotTable {
    "@matomezu/base:screen-footer": Record<string, never> // ステージを並べないスクリーンがカレントの間だけの下の行（何も受け取らない）
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
    "@matomezu/base:bookmarks": BookmarksProps // しおりを出す種類ごとのウィジェット（何も描かず、しおりを置き場に渡す）
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
    // 横断検索のモードのスロットに置く物の、切り替えに出す名前（文言の鍵）
    wideSearchMode?: { title: MessageKey }
    // 横断検索の当たりの開き方のスロットに置く物の、その当たりを開く関数を返すフックと、その名前を画面の物から作る関数を返すフック（任意）。開く種類は、ウィジェットの forKind（種類の持ち主だけが書ける）で引く
    wideSearchOpener?: {
      useOpen: () => (hit: WideSearchHit) => WideSearchOpened
      useLabel?: () => (hit: WideSearchHit) => string | undefined
    }
    // コーナーステータスのスロットに置く物の名前（文言の鍵。設定画面の「コーナーステータスの並び」に出す）
    cornerStatus?: { title: MessageKey }
  }
  interface WidgetTable {
    "@matomezu/base:window": typeof WINDOW
    "@matomezu/base:screens-view": typeof SCREENS_WIDGET
    "@matomezu/base:workspace": typeof WORKSPACE
    "@matomezu/base:library-screen-view": typeof LIBRARY_SCREEN_VIEW
    "@matomezu/base:dialog-host": typeof DIALOG_HOST
    "@matomezu/base:menu-host": typeof MENU_HOST
    "@matomezu/base:toast-host": typeof TOAST_HOST
    "@matomezu/base:stale-build": typeof STALE_BUILD
    "@matomezu/base:settings-update": typeof UPDATE_CATEGORY
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
    "@matomezu/base:bookmark-host": typeof BOOKMARK_HOST
    "@matomezu/base:mail-bookmarks": typeof MAIL_BOOKMARKS
    "@matomezu/base:mail-watch": typeof MAIL_WATCH
    "@matomezu/base:join-request-bookmarks": typeof JOIN_REQUEST_BOOKMARKS
    "@matomezu/base:join-request-watch": typeof JOIN_REQUEST_WATCH
    "@matomezu/base:edit-lock": typeof EDIT_LOCK
    "@matomezu/base:open-guide": typeof OPEN_GUIDE
    "@matomezu/base:startup-error": typeof STARTUP_ERROR
    "@matomezu/base:unreadable-notice": typeof UNREADABLE_NOTICE
    "@matomezu/base:page-place": typeof PAGE_PLACE
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
    "@matomezu/base:footer-close-button": typeof FOOTER_CLOSE_BUTTON
    "@matomezu/base:footer-widen-button": typeof FOOTER_WIDEN_BUTTON
    "@matomezu/base:settings-general": typeof GENERAL_CATEGORY
    "@matomezu/base:settings-keys": typeof KEYS_CATEGORY
    "@matomezu/base:settings-plugins": typeof PLUGINS_CATEGORY
  }
  interface MenuTable {
    "@matomezu/base:stage-menu": true
  }
}
