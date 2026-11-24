// base（ほかのプラグインが読んでよいプラグイン）: ステージ（分割・閉じる）・道具の切り替え（回転ボタンと、長押しで出すアイコン）・置くのの取り消し・ダイアログと右クリックのメニューを閉じる・ブックを開く・ページ・紙・利用者の設定（言語・スキン・キーバインド・文字の色）・標準のテーマ・スキン（ダーク・ライト）と、その既定のキーバインド。
// 機能ごとのフォルダの定義を集めて 1 つのプラグインにする。base の画面の物（ui.tsx）がここのコマンドを呼ぶ
import { defineBuiltin } from "../../store/plugin"
import {
  BOOK_SETTINGS,
  BOOK_SETTINGS_DIALOG,
  BOOK_UPDATE,
  PAGE_PAPER_COLOR,
  PAGE_THEME,
  PAGES_UPDATE,
  THEME_TYPES_CHECK,
} from "./book-look"
import { BOOK_CREATE, BOOK_NEW, NEW_BOOK_DIALOG } from "./book-new"
import { CONTEXT_MENU_STATES, MENU_CLOSE, MENU_KEYS, type PRESSED_ANCHOR } from "./context-menu"
import { CORNER_STATUS_ORDER } from "./corner-status"
import { DIALOG_CLOSE, DIALOG_KEYS, DIALOG_SUBMIT } from "./dialog-host"
import { HISTORY_KEYS, HISTORY_RESTORE, REDO, UNDO } from "./history"
import { kit } from "./kit"
// 拡張ポイントに書き足したメソッド labelOf の型（label/index.ts の declare module）
import type {} from "./label"
import {
  LEFT_SIDE_PANEL_CLOSE,
  LEFT_SIDE_PANEL_KEY_SCOPE,
  LEFT_SIDE_PANEL_KEYS,
  type LEFT_SIDE_PANEL_STATE,
  LEFT_SIDE_PANEL_STATES,
} from "./left-side-panel"
import {
  DOCUMENTS,
  ENTRY_DUPLICATE,
  ENTRY_MOVE,
  ENTRY_MOVE_OVER,
  ENTRY_PURGE,
  ENTRY_REMOVE,
  ENTRY_RENAME,
  ENTRY_RESTORE,
  ENTRY_TRASH,
  FOLDER_CREATE,
  IN_WORKROOMS,
  LIBRARY_APPEARANCE,
  LIBRARY_BOOK_NEW,
  LIBRARY_COLUMNS,
  LIBRARY_CONTENTS_AROUND_KEY_SCOPE,
  LIBRARY_CONTENTS_KEY_SCOPE,
  LIBRARY_ENTRY_DELETE,
  LIBRARY_ENTRY_DUPLICATE,
  LIBRARY_ENTRY_MOVE,
  LIBRARY_ENTRY_OPEN,
  LIBRARY_ENTRY_OPEN_SPLIT,
  LIBRARY_ENTRY_REMOVE,
  LIBRARY_ENTRY_RENAME,
  LIBRARY_ENTRY_TRASH,
  LIBRARY_FOLDER,
  LIBRARY_FOLDER_NEW,
  LIBRARY_FOUND_KEY_SCOPE,
  LIBRARY_FOUND_PICKED,
  LIBRARY_KEY_SCOPE,
  LIBRARY_KEYS,
  LIBRARY_NEW_BOOK_DIALOG,
  LIBRARY_NEW_FOLDER_DIALOG,
  LIBRARY_OPEN,
  LIBRARY_PAGE_NEW,
  LIBRARY_PICK_MOVE,
  LIBRARY_PICKED,
  LIBRARY_PLACE_OPEN,
  LIBRARY_QUERY,
  LIBRARY_REDO,
  LIBRARY_REMOVE_DIALOG,
  LIBRARY_RENAME_DIALOG,
  LIBRARY_REVERT,
  LIBRARY_SCREEN,
  LIBRARY_SCREEN_CLOSE,
  LIBRARY_SCREEN_EXPAND,
  LIBRARY_SCREEN_KEYS,
  LIBRARY_TREE_AROUND_KEY_SCOPE,
  LIBRARY_TREE_FOLD_OR_PARENT,
  LIBRARY_TREE_KEY_SCOPE,
  LIBRARY_TREE_MOVE,
  LIBRARY_TREE_UNFOLD_OR_NEXT,
  LIBRARY_TREE_WIDTH,
  LIBRARY_UNDO,
  LIBRARY_UNFOLDED,
  LIBRARY_UNREADABLE_OPEN,
  PAGE_CREATE,
  SHOW_UNREADABLE_FOLDER,
  TICKETS_HISTORY,
  TRASH_EMPTY,
  UNREADABLE_NOTICE_CLOSED,
  WORKROOMS,
} from "./library"
import { BOOK_LOCK, BOOK_UNLOCK, LOCK, LOCKABLE_CHECK, PAGE_LOCK, PAGE_UNLOCK } from "./lock"
import type { A3, A4, A5, LETTER, TABLOID, WIDE } from "./looks"
import {
  DARK,
  LIGHT,
  MATOMEZU_DARK_SKIN,
  MATOMEZU_LIGHT_SKIN,
  MATOMEZU_THEME,
  PAPERS,
  SIMPLE,
  STANDARD,
  STICKY,
} from "./looks"
// 拡張ポイントに書き足したフィールド shown の型（mail/shown.ts の declare module）
import type {} from "./mail"
import {
  MAIL,
  type MAIL_BIRD_VISIT,
  MAIL_LETTER,
  MAIL_PROPOSAL,
  MAIL_REMOVE,
  MAIL_SEEN,
  MAIL_SEND,
  MAIL_STATES,
  MAIL_VISITED,
  MAILBOX_KEY_SCOPE,
  MAILBOX_KEYS,
  MAILBOX_OPEN,
  MAILBOX_PICK_MOVE,
  type MAILBOX_PICKED,
  MAILBOX_SCREEN,
  MAILBOX_SCREEN_CLOSE,
  MAILBOX_SCREEN_EXPAND,
  type MAILBOX_SENDER_TAB,
  MAILBOX_UNREAD,
  PROPOSAL_APPLY,
  PROPOSAL_SEND,
  PROPOSAL_SETTLE,
} from "./mail"
import {
  MARK,
  MARK_ADD,
  type MARK_ARRIVING,
  MARK_NEW,
  type MARK_PICKER,
  MARK_READ,
  MARK_REMOVE,
  MARK_STATES,
} from "./mark"
import { SOFT_BREAK } from "./markdown"
import { type MINIMAP_DRAWN, MINIMAP_STATES } from "./minimap"
import {
  NOTE,
  NOTE_ADD,
  type NOTE_BIRDS,
  NOTE_DRAFT,
  NOTE_EXPIRY,
  NOTE_KEYS,
  NOTE_NEW,
  NOTE_READ,
  NOTE_REMOVE,
  NOTE_SEND,
  NOTE_STATES,
  NOTE_TALKED,
  NOTE_TEXT_KEY_SCOPE,
  NOTE_UPDATE,
} from "./note"
// 拡張ポイントに書き足したフィールド listed の型（outbox/listed.ts の declare module）
import type {} from "./outbox"
import {
  BINDER_DELETE,
  BINDER_DELETE_DIALOG,
  BINDER_DUPLICATE_COMMAND,
  BINDER_OPEN,
  BINDER_SETTINGS,
  BINDER_SETTINGS_DIALOG,
  BINDER_SETTINGS_OPENED,
  NEW_PAGE_DIALOG,
  PAGE_ADD_AFTER,
  PAGE_DELETE,
  PAGE_DELETE_DIALOG,
  PAGE_DUPLICATE_COMMAND,
  PAGE_NEW,
  PAGE_NEW_IN_FOLDER,
  PAGE_OPEN,
  PAGE_SETTINGS,
  PAGE_SETTINGS_DIALOG,
  PAGE_SETTINGS_OF,
} from "./page-tabs"
import {
  BINDER_DUPLICATE,
  BINDER_MOVE,
  BINDER_REMOVE,
  BINDER_UPDATE,
  PAGE_ADD,
  PAGE_DUPLICATE,
  PAGE_MOVE,
  PAGE_REMOVE,
  PAGE_UPDATE,
  VARIABLE_PAGES,
} from "./pages"
import {
  ADMIN_MARK,
  ADMIN_SET,
  FOLLOW_WORK_ENDED,
  FOLLOW_WORKROOM_GONE,
  JOIN_REQUEST_DIALOG,
  PARTICIPANT,
  PARTICIPANT_ACCEPT,
  PARTICIPANT_ALIVE,
  PARTICIPANT_CANCEL,
  PARTICIPANT_DECLINE,
  PARTICIPANT_JOIN_DIALOG,
  PARTICIPANT_REMOVE,
  PARTICIPANT_REQUEST,
  PARTICIPANT_WELCOME_DIALOG,
  SESSION_RENAME,
  WORK_SUBJECTS_CHECK,
  WORKER_BOOK,
  WORKER_PAGE_ADD,
  WORKROOM,
  WORKROOM_ADD,
  WORKROOM_REMOVE,
  WORKROOM_UPDATE,
} from "./participant"
import { FAMILY_TITLE_CHECK, PROP_NAMES_CHECK } from "./place"
import {
  BACKGROUND_PRINT,
  MEASURES_STATES,
  PRINT,
  PRINT_KEYS,
  type PRINT_MEASURES,
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FIT,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_OPEN,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NAME,
  PRINT_PREVIEW_SETTING_CHECK,
  PRINT_PREVIEW_SHEET_NUMBERS,
  PRINT_PREVIEW_STATES,
  PRINT_PREVIEW_UPDATE,
  type PRINT_READY_STATE,
} from "./print-preview"
import {
  RIGHT_SIDE_PANEL_CLOSE,
  RIGHT_SIDE_PANEL_KEY_SCOPE,
  RIGHT_SIDE_PANEL_KEYS,
  type RIGHT_SIDE_PANEL_RESTORE_STATE,
  type RIGHT_SIDE_PANEL_STATE,
  RIGHT_SIDE_PANEL_STATES,
} from "./right-side-panel"
import {
  SCRAP,
  SCRAP_CUT,
  SCRAP_CUT_COMMAND,
  SCRAP_CUT_DIALOG,
  SCRAP_FRAME_CHECK,
  SCRAP_OPEN_ORIGINAL,
  SCRAP_REMOVE,
} from "./scrap"
import {
  type SEARCH_AT_STATE,
  type SEARCH_CLOSE,
  SEARCH_COMMANDS,
  SEARCH_KEY_SCOPE,
  SEARCH_KEYS,
  type SEARCH_NEXT,
  type SEARCH_OPEN,
  type SEARCH_OPEN_BOOK,
  type SEARCH_OPEN_REPLACE,
  type SEARCH_PICK_STATE,
  type SEARCH_PREVIOUS,
  type SEARCH_REPLACE_ALL,
  type SEARCH_REPLACE_ONE,
  type SEARCH_STATE,
  SEARCH_STATES,
} from "./search"
import {
  ENABLED_PLUGINS,
  KEYS,
  LANG,
  OPTION_TITLES_CHECK,
  SETTINGS_DIALOG,
  SETTINGS_OPEN,
  SETTINGS_SET,
  SETTINGS_SET_COMMAND,
  SKIN,
  USER_NAME,
} from "./settings"
import {
  BACKGROUND_EDIT,
  BACKGROUND_END,
  BACKGROUND_HIDE_CONTENT,
  BACKGROUND_PRINT_SET,
  BACKGROUND_TOGGLE,
  type CONTENT_HIDDEN,
  type PRINT_AREAS_HIDDEN,
  STAGE_CLOSE,
  STAGE_SPLIT,
  STAGE_STATES,
  STAGE_UNSPLIT,
  STAGE_WIDEN,
  type WIDE_STAGE,
} from "./stage"
import { REVEAL_REQUEST_STATES, type REVEALING_STATE } from "./stand"
import { PAGE_TEXT_COLORS, TEXT_COLORS, THEME_TEXT_COLORS_CHECK, USER_TEXT_COLORS } from "./text"
import { TOOL_PICKER, TOOL_PICKER_CLOSE, TOOL_PICKER_HOLD, TOOL_PICKER_KEYS, TOOL_SET } from "./tool-picker"
import { HAND_TOOL, SELECT_TOOL, TOOL_NEXT } from "./tool-switch"
// 拡張ポイントに書き足したフィールド toolbox の型（toolbox.ts の declare module）
import type {} from "./toolbox"
import { TOOLBOX_CANCEL, TOOLBOX_KEYS } from "./toolbox"
import { UPDATE_CHECK } from "./update"
import { WIDE_SEARCH_KEYS, WIDE_SEARCH_MODE, WIDE_SEARCH_TOGGLE, WIDE_SEARCH_WORDS_KEY_SCOPE } from "./wide-search"
import {
  BOOK_SCREEN_CLOSE,
  BOOK_SCREEN_DEF,
  MAXIMIZERS,
  ONE_SCREEN,
  SCREEN_FLASH,
  SCREEN_TOGGLE,
  SPLIT_BACK,
  SPLIT_KEYS,
  SPLIT_ROWS,
} from "./window"
import { ZOOM_FIT, ZOOM_IN, ZOOM_KEYS, ZOOM_OUT, ZOOM_RESET, ZOOM_WHEEL } from "./zoom"

export {
  DIAGRAM_THEME_TYPE,
  DOCUMENT_THEME_TYPE,
  PAGE_PAPER_COLOR,
  PAGE_THEME,
  resolveTokens,
  themeFits,
  themesFor,
} from "./book-look"
export { createBookIn } from "./book-new"
export type { PageContext, SettingReader } from "./book-settings"
export { NO_HOLDER, pageContext, settingValue } from "./book-settings"
export { MY_WORKDESK } from "./library"
export { PAPER_IDS } from "./looks"
// Markdown の原文を読む・描いた文書が使う物（ほかのプラグインが使う。追加プラグインには matomezu から出す）
export {
  drawsMarkdownImage,
  MARKDOWN_DOCUMENT_TOKENS,
  MARKDOWN_PANE_MODES,
  type MarkdownAlign,
  type MarkdownBlock,
  type MarkdownCheck,
  type MarkdownDocument,
  type MarkdownFootnote,
  type MarkdownInline,
  type MarkdownListItem,
  type MarkdownPaneMode,
  type MarkdownRange,
  type MarkdownTableCell,
  parseMarkdown,
  SOFT_BREAK,
  type SoftBreak,
  softBreakOf,
  splitWords,
  type WordFinder,
  type WordLink,
  type WordMatch,
  type WordPiece,
  wordLinksOf,
} from "./markdown"
// 拡張ポイントに書き足した物の型（定義を書くプラグインが使う。追加プラグインには matomezu から出す）
export { itemMinimapMarks, type MinimapMark, NOT_DRAWN } from "./minimap"
export type { PageProblem } from "./pages"
export { addPageIn, type PageFieldsWay, pageFieldsWay } from "./pages"
export {
  adminWorkroom,
  type FoundWorkerBook,
  isAdminActor,
  JOINED_MESSAGE,
  myWorkdeskIn,
  NO_BRANCH,
  NO_CATEGORY,
  NO_MODEL,
  NO_OCCUPANT,
  NO_WORKER_BOOK,
  NOT_CALLED,
  NOT_REQUESTED,
  type ParticipantCategory,
  participantCategory,
  READS_ADMIN,
  READS_WORKROOM_KEYS,
  VISITOR_JOINED_MESSAGE,
  type VisitorRow,
  visitorName,
  type WorkroomRow,
  type WorkroomState,
  workroomActivitiesFrom,
  workTitleIn,
} from "./participant"
// 置く計算と文字（ほかのプラグインが使う。追加プラグインには matomezu から出す）
export type { Axis, Edges, Frame, Gap, GrowFrom, PortArea, Ports } from "./place"
export {
  type AiPlaced,
  adaptPage,
  aiPlacedOf,
  aiPlacedOfPage,
  alignPadding,
  allRectsOf,
  apart,
  CANNOT_PLACE,
  CANNOT_RESIZE,
  CHILD_AREA,
  childOrigin,
  commitChildren,
  evenGap,
  extentOf,
  followConnectors,
  frameAround,
  frameOf,
  freeSpotIn,
  type GrowRule,
  type GrowSides,
  gapOf,
  growKindOf,
  grownArea,
  growOf,
  inPaper,
  itemAiPlaced,
  itemSize,
  keepApart,
  LEN,
  minSize,
  NEST_PADDING,
  NO_AI_PLACED,
  NO_EXTENT,
  NO_FRAME,
  NO_GROW,
  NO_SHAPE_DEF,
  NO_SIZE,
  NO_SPOT,
  newClash,
  nextItemId,
  paperSize,
  placeChild,
  placedAt,
  placedSize,
  placeItem,
  portAreasOf,
  rectsOf,
  removeItems,
  replaceChild,
  replacePushing,
  replaceShapePushing,
  resizedBy,
  roomOf,
  settleChildren,
  shapeDefOf,
  shapeThemeFits,
  shownRects,
  slideOffsetOf,
  tidyPage,
  toData,
  tooClose,
  unpinPage,
  widenForCaption,
} from "./place"
export type { PrintSheets, SheetPurpose } from "./print-preview"
export {
  BACKGROUND_PRINT,
  breakShift,
  printSheetsOf,
  sheetShapes,
  sheetsOfShape,
} from "./print-preview"
export { type Scrap, ScrapSchema, scrapSize } from "./scrap"
export type { SearchableDef } from "./search"
export type { Font, Weight } from "./text"
export {
  AlignSchema,
  type BlockProps,
  BODY_MAX,
  type BodyColumn,
  blockBodyHeight,
  blockBodyLines,
  blockEmpty,
  blockLabel,
  bodyColumn,
  bodyMinWidth,
  bodyText,
  bodyWidthAfter,
  captionTextWidth,
  clampLines,
  clampRich,
  FULL_WIDTH,
  PAGE_TEXT_COLORS,
  PLACE_LINES,
  parseRich,
  plainOf,
  type RichLine,
  type Run,
  richWidth,
  TEXT_LOOK,
  type TextBlock,
  textBlock,
  textBlockHeight,
  textColorId,
  textColorRef,
  textNew,
  textPatch,
  textProps,
  textWidth,
  wrap,
  wrapRich,
} from "./text"

// プラグインに公開する共通の処理（utils。ビルトインプラグインもここから使う）
export * from "./utils"

export const BASE = defineBuiltin(
  kit.plugin({
    actions: [
      PAGE_ADD,
      PAGE_UPDATE,
      PAGE_MOVE,
      PAGE_DUPLICATE,
      BINDER_UPDATE,
      BINDER_MOVE,
      BINDER_DUPLICATE,
      BINDER_REMOVE,
      PAGES_UPDATE,
      PAGE_REMOVE,
      PAGE_LOCK,
      PAGE_UNLOCK,
      BOOK_UPDATE,
      BOOK_LOCK,
      BOOK_UNLOCK,
      BOOK_CREATE,
      WORKER_PAGE_ADD,
      FOLDER_CREATE,
      ENTRY_MOVE,
      ENTRY_MOVE_OVER,
      ENTRY_RENAME,
      ENTRY_DUPLICATE,
      ENTRY_REMOVE,
      PAGE_CREATE,
      ENTRY_TRASH,
      ENTRY_RESTORE,
      ENTRY_PURGE,
      TRASH_EMPTY,
      LIBRARY_REVERT,
      SETTINGS_SET,
      HISTORY_RESTORE,
      NOTE_ADD,
      NOTE_UPDATE,
      NOTE_READ,
      NOTE_TALKED,
      NOTE_REMOVE,
      MAIL_SEND,
      MAIL_SEEN,
      MAIL_VISITED,
      MAIL_REMOVE,
      SCRAP_CUT,
      SCRAP_REMOVE,
      PROPOSAL_SEND,
      PROPOSAL_APPLY,
      PROPOSAL_SETTLE,
      MARK_ADD,
      MARK_READ,
      MARK_REMOVE,
      PRINT_PREVIEW_UPDATE,
      PARTICIPANT_REQUEST,
      PARTICIPANT_ACCEPT,
      PARTICIPANT_DECLINE,
      PARTICIPANT_CANCEL,
      PARTICIPANT_REMOVE,
      WORKROOM_ADD,
      WORKROOM_UPDATE,
      WORKROOM_REMOVE,
      ADMIN_SET,
    ],
    settings: [
      PAGE_THEME,
      PAGE_PAPER_COLOR,
      PAGE_TEXT_COLORS,
      PRINT_PREVIEW_FLOW,
      PRINT_PREVIEW_ORDER,
      PRINT_PREVIEW_SHEET_NUMBERS,
      PRINT_PREVIEW_BOOK_NAME,
      PRINT_PREVIEW_PAGE_NAME,
      BACKGROUND_PRINT,
    ],
    userSettings: [
      LANG,
      SKIN,
      KEYS,
      USER_TEXT_COLORS,
      TOOL_PICKER_HOLD,
      NOTE_EXPIRY,
      MAILBOX_UNREAD,
      PARTICIPANT_ALIVE,
      SESSION_RENAME,
      CORNER_STATUS_ORDER,
      ENABLED_PLUGINS,
      SOFT_BREAK,
      SHOW_UNREADABLE_FOLDER,
      UPDATE_CHECK,
      USER_NAME,
    ],
    themes: [STANDARD, STICKY, SIMPLE, MATOMEZU_THEME],
    papers: PAPERS,
    textColors: TEXT_COLORS,
    skins: [DARK, LIGHT, MATOMEZU_LIGHT_SKIN, MATOMEZU_DARK_SKIN],
    tools: [SELECT_TOOL, HAND_TOOL],
    permissions: [LOCK, WORKER_BOOK, IN_WORKROOMS],
    annotations: [NOTE, MARK],
    systemFolders: [DOCUMENTS, WORKROOMS],
    backyards: [TICKETS_HISTORY],
    followSteps: [FOLLOW_WORKROOM_GONE, FOLLOW_WORK_ENDED],
    mails: [MAIL_LETTER, MAIL_PROPOSAL],
    subjects: [WORKROOM, PARTICIPANT, ADMIN_MARK, MAIL, SCRAP],
    screens: [BOOK_SCREEN_DEF, LIBRARY_SCREEN, MAILBOX_SCREEN],
    screenArrangements: [ONE_SCREEN, SPLIT_ROWS],
    checks: [
      PROP_NAMES_CHECK,
      SCRAP_FRAME_CHECK,
      FAMILY_TITLE_CHECK,
      LOCKABLE_CHECK,
      WORK_SUBJECTS_CHECK,
      PRINT_PREVIEW_SETTING_CHECK,
      OPTION_TITLES_CHECK,
      THEME_TEXT_COLORS_CHECK,
      THEME_TYPES_CHECK,
    ],
    normalizeSteps: [VARIABLE_PAGES],
    commands: [
      SCRAP_CUT_COMMAND,
      SCRAP_OPEN_ORIGINAL,
      BOOK_NEW,
      SCREEN_TOGGLE,
      BOOK_SCREEN_CLOSE,
      SPLIT_BACK,
      STAGE_SPLIT,
      STAGE_UNSPLIT,
      STAGE_CLOSE,
      STAGE_WIDEN,
      BACKGROUND_TOGGLE,
      BACKGROUND_EDIT,
      BACKGROUND_END,
      BACKGROUND_HIDE_CONTENT,
      BACKGROUND_PRINT_SET,
      TOOL_NEXT,
      TOOL_SET,
      TOOL_PICKER,
      TOOL_PICKER_CLOSE,
      ZOOM_IN,
      ZOOM_OUT,
      ZOOM_RESET,
      ZOOM_FIT,
      ZOOM_WHEEL,
      TOOLBOX_CANCEL,
      DIALOG_SUBMIT,
      DIALOG_CLOSE,
      MENU_CLOSE,
      PAGE_NEW,
      BINDER_OPEN,
      BINDER_SETTINGS,
      BINDER_SETTINGS_OPENED,
      BINDER_DUPLICATE_COMMAND,
      BINDER_DELETE,
      PAGE_OPEN,
      PAGE_ADD_AFTER,
      PAGE_DUPLICATE_COMMAND,
      PAGE_DELETE,
      PAGE_SETTINGS,
      PAGE_SETTINGS_OF,
      BOOK_SETTINGS,
      SETTINGS_SET_COMMAND,
      SETTINGS_OPEN,
      UNDO,
      REDO,
      LIBRARY_UNDO,
      LIBRARY_REDO,
      LIBRARY_ENTRY_OPEN,
      LIBRARY_ENTRY_OPEN_SPLIT,
      LIBRARY_BOOK_NEW,
      LIBRARY_OPEN,
      LIBRARY_SCREEN_CLOSE,
      LIBRARY_UNREADABLE_OPEN,
      LIBRARY_PLACE_OPEN,
      LIBRARY_SCREEN_EXPAND,
      MAILBOX_OPEN,
      MAILBOX_PICK_MOVE,
      MAILBOX_SCREEN_CLOSE,
      MAILBOX_SCREEN_EXPAND,
      LIBRARY_FOLDER_NEW,
      LIBRARY_PAGE_NEW,
      PAGE_NEW_IN_FOLDER,
      LIBRARY_ENTRY_RENAME,
      LIBRARY_ENTRY_TRASH,
      LIBRARY_ENTRY_REMOVE,
      LIBRARY_ENTRY_DELETE,
      LIBRARY_ENTRY_DUPLICATE,
      LIBRARY_ENTRY_MOVE,
      LIBRARY_TREE_MOVE,
      LIBRARY_TREE_FOLD_OR_PARENT,
      LIBRARY_TREE_UNFOLD_OR_NEXT,
      LIBRARY_PICK_MOVE,
      NOTE_NEW,
      NOTE_SEND,
      MARK_NEW,
      RIGHT_SIDE_PANEL_CLOSE,
      LEFT_SIDE_PANEL_CLOSE,
      WIDE_SEARCH_TOGGLE,
      PRINT_PREVIEW_OPEN,
      PRINT_PREVIEW_FIT,
      PRINT,
      ...SEARCH_COMMANDS,
    ],
    dialogs: [
      NEW_PAGE_DIALOG,
      PAGE_DELETE_DIALOG,
      BINDER_SETTINGS_DIALOG,
      BINDER_DELETE_DIALOG,
      SCRAP_CUT_DIALOG,
      PAGE_SETTINGS_DIALOG,
      BOOK_SETTINGS_DIALOG,
      NEW_BOOK_DIALOG,
      LIBRARY_NEW_BOOK_DIALOG,
      LIBRARY_NEW_FOLDER_DIALOG,
      LIBRARY_RENAME_DIALOG,
      LIBRARY_REMOVE_DIALOG,
      SETTINGS_DIALOG,
      JOIN_REQUEST_DIALOG,
      PARTICIPANT_JOIN_DIALOG,
      PARTICIPANT_WELCOME_DIALOG,
    ],
    libraryAppearances: [LIBRARY_APPEARANCE],
    pluginStates: [
      ...SEARCH_STATES,
      ...RIGHT_SIDE_PANEL_STATES,
      ...LEFT_SIDE_PANEL_STATES,
      MAXIMIZERS,
      SCREEN_FLASH,
      LIBRARY_FOLDER,
      LIBRARY_PICKED,
      LIBRARY_FOUND_PICKED,
      LIBRARY_COLUMNS,
      LIBRARY_UNFOLDED,
      LIBRARY_QUERY,
      LIBRARY_TREE_WIDTH,
      UNREADABLE_NOTICE_CLOSED,
      ...REVEAL_REQUEST_STATES,
      ...PRINT_PREVIEW_STATES,
      ...MEASURES_STATES,
      ...STAGE_STATES,
      ...MINIMAP_STATES,
      ...MAIL_STATES,
      ...NOTE_STATES,
      NOTE_DRAFT,
      ...MARK_STATES,
      ...CONTEXT_MENU_STATES,
      WIDE_SEARCH_MODE,
    ],
    keyScopes: [
      RIGHT_SIDE_PANEL_KEY_SCOPE,
      LEFT_SIDE_PANEL_KEY_SCOPE,
      SEARCH_KEY_SCOPE,
      WIDE_SEARCH_WORDS_KEY_SCOPE,
      NOTE_TEXT_KEY_SCOPE,
      LIBRARY_KEY_SCOPE,
      LIBRARY_TREE_KEY_SCOPE,
      LIBRARY_CONTENTS_KEY_SCOPE,
      LIBRARY_TREE_AROUND_KEY_SCOPE,
      LIBRARY_CONTENTS_AROUND_KEY_SCOPE,
      LIBRARY_FOUND_KEY_SCOPE,
      MAILBOX_KEY_SCOPE,
    ],
    keys: [
      ...TOOLBOX_KEYS,
      ...TOOL_PICKER_KEYS,
      ...ZOOM_KEYS,
      ...DIALOG_KEYS,
      ...MENU_KEYS,
      ...HISTORY_KEYS,
      ...LIBRARY_KEYS,
      ...LIBRARY_SCREEN_KEYS,
      ...MAILBOX_KEYS,
      ...RIGHT_SIDE_PANEL_KEYS,
      ...LEFT_SIDE_PANEL_KEYS,
      ...SPLIT_KEYS,
      ...PRINT_KEYS,
      ...SEARCH_KEYS,
      ...WIDE_SEARCH_KEYS,
      ...NOTE_KEYS,
    ],
  }),
)

declare module "../../core/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface SettingTable {
    "@matomezu/base:page-theme": typeof PAGE_THEME
    "@matomezu/base:page-paper-color": typeof PAGE_PAPER_COLOR
    "@matomezu/base:page-text-colors": typeof PAGE_TEXT_COLORS
    "@matomezu/base:print-preview-flow": typeof PRINT_PREVIEW_FLOW
    "@matomezu/base:background-print": typeof BACKGROUND_PRINT
    "@matomezu/base:print-preview-order": typeof PRINT_PREVIEW_ORDER
    "@matomezu/base:print-preview-sheet-numbers": typeof PRINT_PREVIEW_SHEET_NUMBERS
    "@matomezu/base:print-preview-book-name": typeof PRINT_PREVIEW_BOOK_NAME
    "@matomezu/base:print-preview-page-name": typeof PRINT_PREVIEW_PAGE_NAME
  }
  interface UserSettingTable {
    "@matomezu/base:lang": typeof LANG
    "@matomezu/base:tool-picker-hold": typeof TOOL_PICKER_HOLD
    "@matomezu/base:note-expiry": typeof NOTE_EXPIRY
    "@matomezu/base:mailbox-unread": typeof MAILBOX_UNREAD
    "@matomezu/base:participant-alive": typeof PARTICIPANT_ALIVE
    "@matomezu/base:update-check": typeof UPDATE_CHECK
    "@matomezu/base:user-name": typeof USER_NAME
    "@matomezu/base:session-rename": typeof SESSION_RENAME
    "@matomezu/base:soft-break": typeof SOFT_BREAK
    "@matomezu/base:corner-status-order": typeof CORNER_STATUS_ORDER
    "@matomezu/base:enabled-plugins": typeof ENABLED_PLUGINS
    "@matomezu/base:show-unreadable-folder": typeof SHOW_UNREADABLE_FOLDER
    "@matomezu/base:skin": typeof SKIN
    "@matomezu/base:keys": typeof KEYS
    "@matomezu/base:text-colors": typeof USER_TEXT_COLORS
  }
  interface ActionTable {
    "@matomezu/base:book-create": typeof BOOK_CREATE
    "@matomezu/base:worker-page-add": typeof WORKER_PAGE_ADD
    "@matomezu/base:page-add": typeof PAGE_ADD
    "@matomezu/base:book-update": typeof BOOK_UPDATE
    "@matomezu/base:page-update": typeof PAGE_UPDATE
    "@matomezu/base:page-move": typeof PAGE_MOVE
    "@matomezu/base:page-duplicate": typeof PAGE_DUPLICATE
    "@matomezu/base:binder-update": typeof BINDER_UPDATE
    "@matomezu/base:binder-move": typeof BINDER_MOVE
    "@matomezu/base:binder-duplicate": typeof BINDER_DUPLICATE
    "@matomezu/base:binder-remove": typeof BINDER_REMOVE
    "@matomezu/base:pages-update": typeof PAGES_UPDATE
    "@matomezu/base:page-remove": typeof PAGE_REMOVE
    "@matomezu/base:page-lock": typeof PAGE_LOCK
    "@matomezu/base:page-unlock": typeof PAGE_UNLOCK
    "@matomezu/base:book-lock": typeof BOOK_LOCK
    "@matomezu/base:book-unlock": typeof BOOK_UNLOCK
    "@matomezu/base:folder-create": typeof FOLDER_CREATE
    "@matomezu/base:entry-move": typeof ENTRY_MOVE
    "@matomezu/base:entry-move-over": typeof ENTRY_MOVE_OVER
    "@matomezu/base:entry-rename": typeof ENTRY_RENAME
    "@matomezu/base:entry-duplicate": typeof ENTRY_DUPLICATE
    "@matomezu/base:entry-remove": typeof ENTRY_REMOVE
    "@matomezu/base:page-create": typeof PAGE_CREATE
    "@matomezu/base:entry-trash": typeof ENTRY_TRASH
    "@matomezu/base:entry-restore": typeof ENTRY_RESTORE
    "@matomezu/base:entry-purge": typeof ENTRY_PURGE
    "@matomezu/base:library-revert": typeof LIBRARY_REVERT
    "@matomezu/base:trash-empty": typeof TRASH_EMPTY
    "@matomezu/base:settings-set": typeof SETTINGS_SET
    "@matomezu/base:history-revert": typeof HISTORY_RESTORE
    "@matomezu/base:note-add": typeof NOTE_ADD
    "@matomezu/base:note-update": typeof NOTE_UPDATE
    "@matomezu/base:note-read": typeof NOTE_READ
    "@matomezu/base:note-talked": typeof NOTE_TALKED
    "@matomezu/base:note-remove": typeof NOTE_REMOVE
    "@matomezu/base:mail-send": typeof MAIL_SEND
    "@matomezu/base:mail-seen": typeof MAIL_SEEN
    "@matomezu/base:mail-visited": typeof MAIL_VISITED
    "@matomezu/base:mail-remove": typeof MAIL_REMOVE
    "@matomezu/base:scrap-cut": typeof SCRAP_CUT
    "@matomezu/base:scrap-remove": typeof SCRAP_REMOVE
    "@matomezu/base:proposal-send": typeof PROPOSAL_SEND
    "@matomezu/base:proposal-apply": typeof PROPOSAL_APPLY
    "@matomezu/base:proposal-settle": typeof PROPOSAL_SETTLE
    "@matomezu/base:mark-add": typeof MARK_ADD
    "@matomezu/base:mark-read": typeof MARK_READ
    "@matomezu/base:mark-remove": typeof MARK_REMOVE
    "@matomezu/base:print-preview-update": typeof PRINT_PREVIEW_UPDATE
    "@matomezu/base:participant-request": typeof PARTICIPANT_REQUEST
    "@matomezu/base:participant-accept": typeof PARTICIPANT_ACCEPT
    "@matomezu/base:participant-decline": typeof PARTICIPANT_DECLINE
    "@matomezu/base:participant-cancel": typeof PARTICIPANT_CANCEL
    "@matomezu/base:participant-remove": typeof PARTICIPANT_REMOVE
    "@matomezu/base:workroom-add": typeof WORKROOM_ADD
    "@matomezu/base:workroom-update": typeof WORKROOM_UPDATE
    "@matomezu/base:workroom-remove": typeof WORKROOM_REMOVE
    "@matomezu/base:admin-set": typeof ADMIN_SET
  }
  interface ThemeTable {
    "@matomezu/base:standard": typeof STANDARD
    "@matomezu/base:sticky": typeof STICKY
    "@matomezu/base:simple": typeof SIMPLE
    "@matomezu/base:matomezu": typeof MATOMEZU_THEME
  }
  interface PermissionTable {
    "@matomezu/base:lock": typeof LOCK
    "@matomezu/base:worker-book": typeof WORKER_BOOK
    "@matomezu/base:in-workrooms": typeof IN_WORKROOMS
  }
  interface AnnotationTable {
    "@matomezu/base:note": typeof NOTE
    "@matomezu/base:mark": typeof MARK
  }
  interface SystemFolderTable {
    "@matomezu/base:documents": typeof DOCUMENTS
    "@matomezu/base:workrooms": typeof WORKROOMS
  }
  interface BackyardTable {
    "@matomezu/base:tickets-history": typeof TICKETS_HISTORY
  }
  interface ScreenTable {
    "@matomezu/base:book-screen": typeof BOOK_SCREEN_DEF
    "@matomezu/base:library-screen": typeof LIBRARY_SCREEN
    "@matomezu/base:mailbox-screen": typeof MAILBOX_SCREEN
  }
  interface ScreenArrangementTable {
    "@matomezu/base:one-screen": typeof ONE_SCREEN
    "@matomezu/base:split-rows": typeof SPLIT_ROWS
  }
  interface SubjectTable {
    "@matomezu/base:workroom": typeof WORKROOM
    "@matomezu/base:participant": typeof PARTICIPANT
    "@matomezu/base:admin-mark": typeof ADMIN_MARK
    "@matomezu/base:mail": typeof MAIL
    "@matomezu/base:scrap": typeof SCRAP
  }
  interface MailTable {
    "@matomezu/base:letter": typeof MAIL_LETTER
    "@matomezu/base:proposal": typeof MAIL_PROPOSAL
  }
  interface ToolTable {
    "@matomezu/base:select": typeof SELECT_TOOL
    "@matomezu/base:hand": typeof HAND_TOOL
  }
  interface SkinTable {
    "@matomezu/base:dark": typeof DARK
    "@matomezu/base:light": typeof LIGHT
    "@matomezu/base:matomezu-light": typeof MATOMEZU_LIGHT_SKIN
    "@matomezu/base:matomezu-dark": typeof MATOMEZU_DARK_SKIN
  }
  interface TextColorTable {
    "@matomezu/base:success": (typeof TEXT_COLORS)[0]
    "@matomezu/base:info": (typeof TEXT_COLORS)[1]
    "@matomezu/base:warn": (typeof TEXT_COLORS)[2]
    "@matomezu/base:error": (typeof TEXT_COLORS)[3]
  }
  interface PaperTable {
    "@matomezu/base:a5": typeof A5
    "@matomezu/base:a4": typeof A4
    "@matomezu/base:a3": typeof A3
    "@matomezu/base:letter": typeof LETTER
    "@matomezu/base:tabloid": typeof TABLOID
    "@matomezu/base:ratio-16x9": typeof WIDE
  }
  interface CommandTable {
    "@matomezu/base:book-new": typeof BOOK_NEW
    "@matomezu/base:scrap-cut": typeof SCRAP_CUT_COMMAND
    "@matomezu/base:scrap-open-original": typeof SCRAP_OPEN_ORIGINAL
    "@matomezu/base:undo": typeof UNDO
    "@matomezu/base:redo": typeof REDO
    "@matomezu/base:library-undo": typeof LIBRARY_UNDO
    "@matomezu/base:library-redo": typeof LIBRARY_REDO
    "@matomezu/base:library-entry-open": typeof LIBRARY_ENTRY_OPEN
    "@matomezu/base:library-entry-open-split": typeof LIBRARY_ENTRY_OPEN_SPLIT
    "@matomezu/base:library-book-new": typeof LIBRARY_BOOK_NEW
    "@matomezu/base:library-open": typeof LIBRARY_OPEN
    "@matomezu/base:library-screen-close": typeof LIBRARY_SCREEN_CLOSE
    "@matomezu/base:mailbox-open": typeof MAILBOX_OPEN
    "@matomezu/base:mailbox-pick-move": typeof MAILBOX_PICK_MOVE
    "@matomezu/base:mailbox-screen-close": typeof MAILBOX_SCREEN_CLOSE
    "@matomezu/base:mailbox-screen-expand": typeof MAILBOX_SCREEN_EXPAND
    "@matomezu/base:library-unreadable-open": typeof LIBRARY_UNREADABLE_OPEN
    "@matomezu/base:library-place-open": typeof LIBRARY_PLACE_OPEN
    "@matomezu/base:library-screen-expand": typeof LIBRARY_SCREEN_EXPAND
    "@matomezu/base:library-folder-new": typeof LIBRARY_FOLDER_NEW
    "@matomezu/base:library-page-new": typeof LIBRARY_PAGE_NEW
    "@matomezu/base:page-new-in-folder": typeof PAGE_NEW_IN_FOLDER
    "@matomezu/base:library-entry-rename": typeof LIBRARY_ENTRY_RENAME
    "@matomezu/base:library-entry-move": typeof LIBRARY_ENTRY_MOVE
    "@matomezu/base:library-tree-move": typeof LIBRARY_TREE_MOVE
    "@matomezu/base:library-tree-fold-or-parent": typeof LIBRARY_TREE_FOLD_OR_PARENT
    "@matomezu/base:library-tree-unfold-or-next": typeof LIBRARY_TREE_UNFOLD_OR_NEXT
    "@matomezu/base:library-pick-move": typeof LIBRARY_PICK_MOVE
    "@matomezu/base:library-entry-trash": typeof LIBRARY_ENTRY_TRASH
    "@matomezu/base:library-entry-remove": typeof LIBRARY_ENTRY_REMOVE
    "@matomezu/base:library-entry-delete": typeof LIBRARY_ENTRY_DELETE
    "@matomezu/base:library-entry-duplicate": typeof LIBRARY_ENTRY_DUPLICATE
    "@matomezu/base:screen-toggle": typeof SCREEN_TOGGLE
    "@matomezu/base:book-screen-close": typeof BOOK_SCREEN_CLOSE
    "@matomezu/base:split-back": typeof SPLIT_BACK
    "@matomezu/base:stage-split": typeof STAGE_SPLIT
    "@matomezu/base:stage-unsplit": typeof STAGE_UNSPLIT
    "@matomezu/base:stage-close": typeof STAGE_CLOSE
    "@matomezu/base:stage-widen": typeof STAGE_WIDEN
    "@matomezu/base:background-toggle": typeof BACKGROUND_TOGGLE
    "@matomezu/base:background-edit": typeof BACKGROUND_EDIT
    "@matomezu/base:background-end": typeof BACKGROUND_END
    "@matomezu/base:background-hide-content": typeof BACKGROUND_HIDE_CONTENT
    "@matomezu/base:background-print-set": typeof BACKGROUND_PRINT_SET
    "@matomezu/base:tool-next": typeof TOOL_NEXT
    "@matomezu/base:tool-set": typeof TOOL_SET
    "@matomezu/base:tool-picker": typeof TOOL_PICKER
    "@matomezu/base:tool-picker-close": typeof TOOL_PICKER_CLOSE
    "@matomezu/base:zoom-in": typeof ZOOM_IN
    "@matomezu/base:zoom-out": typeof ZOOM_OUT
    "@matomezu/base:zoom-reset": typeof ZOOM_RESET
    "@matomezu/base:zoom-fit": typeof ZOOM_FIT
    "@matomezu/base:zoom-wheel": typeof ZOOM_WHEEL
    "@matomezu/base:toolbox-cancel": typeof TOOLBOX_CANCEL
    "@matomezu/base:dialog-submit": typeof DIALOG_SUBMIT
    "@matomezu/base:dialog-close": typeof DIALOG_CLOSE
    "@matomezu/base:menu-close": typeof MENU_CLOSE
    "@matomezu/base:page-new": typeof PAGE_NEW
    "@matomezu/base:page-open": typeof PAGE_OPEN
    "@matomezu/base:binder-open": typeof BINDER_OPEN
    "@matomezu/base:binder-settings": typeof BINDER_SETTINGS
    "@matomezu/base:binder-settings-opened": typeof BINDER_SETTINGS_OPENED
    "@matomezu/base:binder-duplicate": typeof BINDER_DUPLICATE_COMMAND
    "@matomezu/base:binder-delete": typeof BINDER_DELETE
    "@matomezu/base:page-add-after": typeof PAGE_ADD_AFTER
    "@matomezu/base:page-duplicate": typeof PAGE_DUPLICATE_COMMAND
    "@matomezu/base:page-delete": typeof PAGE_DELETE
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS
    "@matomezu/base:page-settings-of": typeof PAGE_SETTINGS_OF
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS
    "@matomezu/base:print-preview-open": typeof PRINT_PREVIEW_OPEN
    "@matomezu/base:print-preview-fit": typeof PRINT_PREVIEW_FIT
    "@matomezu/base:print": typeof PRINT
    "@matomezu/base:settings-set": typeof SETTINGS_SET_COMMAND
    "@matomezu/base:settings-open": typeof SETTINGS_OPEN
    "@matomezu/base:note-new": typeof NOTE_NEW
    "@matomezu/base:note-send": typeof NOTE_SEND
    "@matomezu/base:mark-new": typeof MARK_NEW
    "@matomezu/base:right-side-panel-close": typeof RIGHT_SIDE_PANEL_CLOSE
    "@matomezu/base:search-open": typeof SEARCH_OPEN
    "@matomezu/base:search-open-book": typeof SEARCH_OPEN_BOOK
    "@matomezu/base:search-open-replace": typeof SEARCH_OPEN_REPLACE
    "@matomezu/base:search-next": typeof SEARCH_NEXT
    "@matomezu/base:search-previous": typeof SEARCH_PREVIOUS
    "@matomezu/base:search-close": typeof SEARCH_CLOSE
    "@matomezu/base:search-replace-one": typeof SEARCH_REPLACE_ONE
    "@matomezu/base:search-replace-all": typeof SEARCH_REPLACE_ALL
    "@matomezu/base:left-side-panel-close": typeof LEFT_SIDE_PANEL_CLOSE
    "@matomezu/base:wide-search-toggle": typeof WIDE_SEARCH_TOGGLE
  }
  interface LibraryAppearanceTable {
    "@matomezu/base:library": typeof LIBRARY_APPEARANCE
  }
  interface PluginStateTable {
    "@matomezu/base:search": typeof SEARCH_STATE
    "@matomezu/base:note-draft": typeof NOTE_DRAFT
    "@matomezu/base:search-at": typeof SEARCH_AT_STATE
    "@matomezu/base:search-pick": typeof SEARCH_PICK_STATE
    "@matomezu/base:wide-search-mode": typeof WIDE_SEARCH_MODE
    "@matomezu/base:right-side-panel": typeof RIGHT_SIDE_PANEL_STATE
    "@matomezu/base:right-side-panel-restore": typeof RIGHT_SIDE_PANEL_RESTORE_STATE
    "@matomezu/base:left-side-panel": typeof LEFT_SIDE_PANEL_STATE
    "@matomezu/base:control-center-maximizers": typeof MAXIMIZERS
    "@matomezu/base:screen-flash": typeof SCREEN_FLASH
    "@matomezu/base:library-folder": typeof LIBRARY_FOLDER
    "@matomezu/base:library-picked": typeof LIBRARY_PICKED
    "@matomezu/base:library-found-picked": typeof LIBRARY_FOUND_PICKED
    "@matomezu/base:unreadable-notice-closed": typeof UNREADABLE_NOTICE_CLOSED
    "@matomezu/base:library-columns": typeof LIBRARY_COLUMNS
    "@matomezu/base:library-unfolded": typeof LIBRARY_UNFOLDED
    "@matomezu/base:library-query": typeof LIBRARY_QUERY
    "@matomezu/base:library-tree-width": typeof LIBRARY_TREE_WIDTH
    "@matomezu/base:revealing": typeof REVEALING_STATE
    "@matomezu/base:print-ready": typeof PRINT_READY_STATE
    "@matomezu/base:print-measures": typeof PRINT_MEASURES
    "@matomezu/base:content-hidden": typeof CONTENT_HIDDEN
    "@matomezu/base:wide-stage": typeof WIDE_STAGE
    "@matomezu/base:print-areas-hidden": typeof PRINT_AREAS_HIDDEN
    "@matomezu/base:minimap-drawn": typeof MINIMAP_DRAWN
    "@matomezu/base:mail-bird-visit": typeof MAIL_BIRD_VISIT
    "@matomezu/base:mailbox-picked": typeof MAILBOX_PICKED
    "@matomezu/base:mailbox-sender-tab": typeof MAILBOX_SENDER_TAB
    "@matomezu/base:note-birds": typeof NOTE_BIRDS
    "@matomezu/base:mark-picker": typeof MARK_PICKER
    "@matomezu/base:mark-arriving": typeof MARK_ARRIVING
    "@matomezu/base:pressed-anchor": typeof PRESSED_ANCHOR
  }
  interface KeyScopeTable {
    "@matomezu/base:right-side-panel": typeof RIGHT_SIDE_PANEL_KEY_SCOPE // 右サイドパネルの中にフォーカスがある間のキー
    "@matomezu/base:left-side-panel": typeof LEFT_SIDE_PANEL_KEY_SCOPE // 左サイドパネルの中にフォーカスがある間のキー
    "@matomezu/base:search": typeof SEARCH_KEY_SCOPE // 検索ダイアログの入力Formの中のキー
    "@matomezu/base:wide-search-words": typeof WIDE_SEARCH_WORDS_KEY_SCOPE // 横断検索の検索語のテキストFormの中のキー
    "@matomezu/base:note-text": typeof NOTE_TEXT_KEY_SCOPE // 右サイドパネルの伝言のテキストFormの中のキー
    "@matomezu/base:library-tree": typeof LIBRARY_TREE_KEY_SCOPE // 書庫の画面のツリーの中にフォーカスがある間のキー
    "@matomezu/base:library-contents": typeof LIBRARY_CONTENTS_KEY_SCOPE // 書庫の画面の右の枠の中身の中にフォーカスがある間のキー
    "@matomezu/base:library-tree-around": typeof LIBRARY_TREE_AROUND_KEY_SCOPE // 書庫の画面のツリーの、行の外にフォーカスがある間のキー（矢印だけ）
    "@matomezu/base:library-contents-around": typeof LIBRARY_CONTENTS_AROUND_KEY_SCOPE // 書庫の画面の右の枠の中身の、行の外にフォーカスがある間のキー（矢印だけ）
    "@matomezu/base:library-found": typeof LIBRARY_FOUND_KEY_SCOPE // 書庫の画面の検索の結果の中にフォーカスがある間のキー
    "@matomezu/base:library": typeof LIBRARY_KEY_SCOPE // 書庫の画面の中にフォーカスがある間のキー
    "@matomezu/base:mailbox": typeof MAILBOX_KEY_SCOPE // 郵便箱の画面の中にフォーカスがある間のキー
  }
  interface DialogTable {
    "@matomezu/base:join-request": typeof JOIN_REQUEST_DIALOG
    "@matomezu/base:participant-join": typeof PARTICIPANT_JOIN_DIALOG
    "@matomezu/base:participant-welcome": typeof PARTICIPANT_WELCOME_DIALOG
    "@matomezu/base:book-new": typeof NEW_BOOK_DIALOG
    "@matomezu/base:library-book-new": typeof LIBRARY_NEW_BOOK_DIALOG
    "@matomezu/base:library-folder-new": typeof LIBRARY_NEW_FOLDER_DIALOG
    "@matomezu/base:library-entry-rename": typeof LIBRARY_RENAME_DIALOG
    "@matomezu/base:library-entry-remove": typeof LIBRARY_REMOVE_DIALOG
    "@matomezu/base:page-new": typeof NEW_PAGE_DIALOG
    "@matomezu/base:page-delete": typeof PAGE_DELETE_DIALOG
    "@matomezu/base:binder-settings": typeof BINDER_SETTINGS_DIALOG
    "@matomezu/base:binder-delete": typeof BINDER_DELETE_DIALOG
    "@matomezu/base:scrap-cut": typeof SCRAP_CUT_DIALOG
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS_DIALOG
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS_DIALOG
    "@matomezu/base:settings": typeof SETTINGS_DIALOG
  }
}
