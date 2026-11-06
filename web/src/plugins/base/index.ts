// base（ほかのプラグインが読んでよいプラグイン）: ステージ（ホームを開く・分割・閉じる）・道具の切り替え（回転ボタンと、長押しで出すアイコン）・置くのの取り消し・ダイアログと右クリックのメニューを閉じる・ブックを開く・ページ・紙・利用者の設定（言語・スキン・キーバインド・文字の色）・標準のテーマ・スキン（ダーク・ライト）と、その既定のキーバインド。
// 機能ごとのフォルダの定義を集めて 1 つのプラグインにする。画面の骨組みのウィジェット（ui.tsx）がここのコマンドを呼ぶ
import { defineBuiltin } from "../../store/plugin"
import { BOOK_PAPER_COLOR, BOOK_SETTINGS, BOOK_SETTINGS_DIALOG, BOOK_THEME, BOOK_UPDATE } from "./book-look"
import { BOOK_CREATE, BOOK_NEW, NEW_BOOK_DIALOG } from "./book-new"
import { CREATE_SETTINGS_CHECK } from "./book-new/book-create"
import { BOOK_OPEN, BOOK_PURGE, BOOK_RESTORE, BOOK_TRASH, OPEN_BOOK_DIALOG, TRASH_EMPTY } from "./book-open"
import { MENU_CLOSE, MENU_KEYS } from "./context-menu"
import { DIALOG_CLOSE, DIALOG_KEYS, DIALOG_SUBMIT } from "./dialog-host"
import { HISTORY_KEYS, HISTORY_RESTORE, REDO, UNDO } from "./history"
import { kit } from "./kit"
// 拡張ポイントに書き足したメソッド labelOf の型（label/index.ts の declare module）
import type {} from "./label"
import { LEFT_SIDE_PANEL_CLOSE, LEFT_SIDE_PANEL_KEY_SCOPE, LEFT_SIDE_PANEL_KEYS } from "./left-side-panel"
import { BOOK_LOCK, BOOK_UNLOCK, LOCK, PAGE_LOCK, PAGE_UNLOCK } from "./lock"
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
import type { A3, A4, A5, LETTER, TABLOID } from "./looks/papers"
import { MAIL_LETTER, MAIL_REMOVE, MAIL_SEEN, MAIL_SEND, MAIL_VISITED } from "./mail"
import { MAIL_DIALOG } from "./mail/dialogs"
// 拡張ポイントに書き足したフィールド shown の型（mail/shown.ts の declare module）
import type {} from "./mail/shown"
import { MARK, MARK_ADD, MARK_READ, MARK_REMOVE } from "./mark"
import { MARK_NEW } from "./mark/commands"
import { NOTE, NOTE_ADD, NOTE_READ, NOTE_REMOVE, NOTE_TALKED, NOTE_UPDATE } from "./note"
import { NOTE_NEW } from "./note/commands"
import { NOTE_EXPIRY } from "./note/expiry"
// 拡張ポイントに書き足したフィールド listed の型（outbox/listed.ts の declare module）
import type {} from "./outbox/listed"
import { NEW_PAGE_DIALOG, PAGE_ADD, PAGE_NEW, PAGE_OPEN, PAGE_SETTINGS, PAGE_SETTINGS_DIALOG } from "./page-tabs"
import { PAGE_MOVE } from "./page-tabs/page-move"
import { PAGE_REMOVE } from "./page-tabs/page-remove"
import { PAGE_UPDATE } from "./page-tabs/page-update"
import { VARIABLE_PAGES } from "./page-tabs/variable-pages"
import { FAMILY_TITLE_CHECK, PROP_NAMES_CHECK } from "./place/items"
import {
  PRINT,
  PRINT_KEYS,
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FIT,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_OPEN,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NAME,
  PRINT_PREVIEW_PAGE_NUMBERS,
  PRINT_PREVIEW_UPDATE,
} from "./print-preview"
import { RIGHT_SIDE_PANEL_CLOSE, RIGHT_SIDE_PANEL_KEY_SCOPE, RIGHT_SIDE_PANEL_KEYS } from "./right-side-panel"
import {
  KEYS,
  LANG,
  OPTION_TITLES_CHECK,
  SETTINGS_DIALOG,
  SETTINGS_OPEN,
  SETTINGS_SET,
  SETTINGS_SET_COMMAND,
  SKIN,
} from "./settings"
import { STAGE_CLOSE, STAGE_HOME, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage"
import { BOOK_TEXT_COLORS, TEXT_COLORS, THEME_TEXT_COLORS_CHECK, USER_TEXT_COLORS } from "./text"
import { TOOL_PICKER, TOOL_PICKER_KEYS, TOOL_SET } from "./tool-picker"
import { TOOL_PICKER_HOLD } from "./tool-picker/hold"
import { TOOL_NEXT } from "./tool-switch"
import { HAND_TOOL, SELECT_TOOL } from "./tool-switch/tools"
import { TOOLBOX_CANCEL, TOOLBOX_KEYS } from "./toolbox"
// 拡張ポイントに書き足したフィールド toolbox の型（toolbox.ts の declare module）
import type {} from "./toolbox/toolbox"
import { CORNER_STATUS_ORDER } from "./utils/corner-order"
import { ZOOM_FIT, ZOOM_IN, ZOOM_KEYS, ZOOM_OUT, ZOOM_RESET, ZOOM_WHEEL } from "./zoom"

export { BOOK_PAPER_COLOR, BOOK_THEME } from "./book-look"
export { createBookIn } from "./book-new/create-book"
export type { PageContext, SettingReader } from "./book-settings"
export { pageContext, settingValue } from "./book-settings"
export { PAPER_IDS } from "./looks"
// Markdown の原文を読む（ほかのプラグインが使う。追加プラグインには matomezu から出す）
export {
  type MarkdownAlign,
  type MarkdownBlock,
  type MarkdownCheck,
  type MarkdownDocument,
  type MarkdownFootnote,
  type MarkdownInline,
  type MarkdownListItem,
  type MarkdownRange,
  type MarkdownTableCell,
  parseMarkdown,
} from "./markdown"
// 拡張ポイントに書き足した物の型（定義を書くプラグインが使う。追加プラグインには matomezu から出す）
export { itemMinimapMarks, type MinimapMark } from "./minimap/marks"
export { addPageIn } from "./page-tabs/add-page"
export { type PageFieldsWay, pageFieldsWay } from "./page-tabs/page-fields"
export type { PageProblem } from "./page-tabs/page-problems"
export { nextPageTitle } from "./page-tabs/pages"
export { type AiPlaced, aiPlacedOf, itemAiPlaced } from "./place/ai-placed"
export type { Frame } from "./place/frame"
export {
  CHILD_AREA,
  childOrigin,
  commitChildren,
  frameAround,
  frameOf,
  freeSpotIn,
  placeChild,
  replaceChild,
  settleChildren,
  toData,
} from "./place/frame"
export { type GrowRule, type GrowSides, grownArea } from "./place/grow"
// 置く計算と文字（ほかのプラグインが使う。追加プラグインには matomezu から出す）
export type { Edges, GrowFrom } from "./place/items"
export {
  adaptPage,
  alignPadding,
  extentOf,
  followConnectors,
  gapOf,
  growOf,
  itemSize,
  keepApart,
  knownTheme,
  minSize,
  nextItemId,
  paperSize,
  placedAt,
  placeItem,
  removeItems,
  replacePushing,
  replaceShapePushing,
  resizedBy,
  roomOf,
  shownRects,
  unpinPage,
  widenForCaption,
  withPage,
} from "./place/items"
export type { PortArea, Ports } from "./place/placed"
export { allRectsOf, NEST_PADDING, placedSize, portAreasOf, rectsOf, shapeDefOf } from "./place/placed"
export type { Axis, Gap } from "./place/push"
export { apart, evenGap, inPaper, LEN, newClash, tooClose } from "./place/push"
export type { PrintSheets, SheetPurpose } from "./print-preview"
export { breakShift } from "./print-preview/breaks"
export { printSheetsOf, sheetShapes, sheetsOfShape } from "./print-preview/filled"
export { PRINT_PREVIEW_SETTINGS } from "./print-preview/settings"
export {
  BOOK_TEXT_COLORS,
  clampRich,
  parseRich,
  plainOf,
  type RichLine,
  type Run,
  richWidth,
  textColorId,
  textColorRef,
  wrapRich,
} from "./text"
export {
  type BlockProps,
  type BodyColumn,
  blockBodyHeight,
  blockBodyLines,
  blockLabel,
  bodyColumn,
  bodyMinWidth,
  bodyWidthAfter,
  type TextBlock,
  textBlock,
  textBlockHeight,
} from "./text/block"
export {
  AlignSchema,
  BODY_MAX,
  bodyText,
  captionTextWidth,
  PLACE_LINES,
  TEXT_LOOK,
  textNew,
  textPatch,
  textProps,
} from "./text/fields"
export type { Font, Weight } from "./text/text"
export { clampLines, textWidth, wrap } from "./text/text"
// プラグインに公開する共通の処理（utils。ビルトインプラグインもここから使う）
export * from "./utils"

export const BASE = defineBuiltin(
  kit.plugin({
    actions: [
      PAGE_ADD,
      PAGE_UPDATE,
      PAGE_MOVE,
      PAGE_REMOVE,
      PAGE_LOCK,
      PAGE_UNLOCK,
      BOOK_UPDATE,
      BOOK_LOCK,
      BOOK_UNLOCK,
      BOOK_CREATE,
      BOOK_TRASH,
      BOOK_RESTORE,
      BOOK_PURGE,
      TRASH_EMPTY,
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
      MARK_ADD,
      MARK_READ,
      MARK_REMOVE,
      PRINT_PREVIEW_UPDATE,
    ],
    settings: [
      BOOK_THEME,
      BOOK_PAPER_COLOR,
      BOOK_TEXT_COLORS,
      PRINT_PREVIEW_FLOW,
      PRINT_PREVIEW_ORDER,
      PRINT_PREVIEW_PAGE_NUMBERS,
      PRINT_PREVIEW_BOOK_NAME,
      PRINT_PREVIEW_PAGE_NAME,
    ],
    userSettings: [LANG, SKIN, KEYS, USER_TEXT_COLORS, TOOL_PICKER_HOLD, NOTE_EXPIRY, CORNER_STATUS_ORDER],
    themes: [STANDARD, STICKY, SIMPLE, MATOMEZU_THEME],
    papers: PAPERS,
    textColors: TEXT_COLORS,
    skins: [DARK, LIGHT, MATOMEZU_LIGHT_SKIN, MATOMEZU_DARK_SKIN],
    tools: [SELECT_TOOL, HAND_TOOL],
    permissions: [LOCK],
    annotations: [NOTE, MARK],
    mails: [MAIL_LETTER],
    checks: [PROP_NAMES_CHECK, FAMILY_TITLE_CHECK, CREATE_SETTINGS_CHECK, OPTION_TITLES_CHECK, THEME_TEXT_COLORS_CHECK],
    normalizeSteps: [VARIABLE_PAGES],
    commands: [
      BOOK_NEW,
      STAGE_HOME,
      STAGE_SPLIT,
      STAGE_UNSPLIT,
      STAGE_CLOSE,
      TOOL_NEXT,
      TOOL_SET,
      TOOL_PICKER,
      ZOOM_IN,
      ZOOM_OUT,
      ZOOM_RESET,
      ZOOM_FIT,
      ZOOM_WHEEL,
      TOOLBOX_CANCEL,
      DIALOG_SUBMIT,
      DIALOG_CLOSE,
      MENU_CLOSE,
      BOOK_OPEN,
      PAGE_NEW,
      PAGE_OPEN,
      PAGE_SETTINGS,
      BOOK_SETTINGS,
      SETTINGS_SET_COMMAND,
      SETTINGS_OPEN,
      UNDO,
      REDO,
      NOTE_NEW,
      MARK_NEW,
      RIGHT_SIDE_PANEL_CLOSE,
      LEFT_SIDE_PANEL_CLOSE,
      PRINT_PREVIEW_OPEN,
      PRINT_PREVIEW_FIT,
      PRINT,
    ],
    dialogs: [
      OPEN_BOOK_DIALOG,
      NEW_PAGE_DIALOG,
      PAGE_SETTINGS_DIALOG,
      BOOK_SETTINGS_DIALOG,
      NEW_BOOK_DIALOG,
      SETTINGS_DIALOG,
      MAIL_DIALOG,
    ],
    keyScopes: [RIGHT_SIDE_PANEL_KEY_SCOPE, LEFT_SIDE_PANEL_KEY_SCOPE],
    keys: [
      ...TOOLBOX_KEYS,
      ...TOOL_PICKER_KEYS,
      ...ZOOM_KEYS,
      ...DIALOG_KEYS,
      ...MENU_KEYS,
      ...HISTORY_KEYS,
      ...RIGHT_SIDE_PANEL_KEYS,
      ...LEFT_SIDE_PANEL_KEYS,
      ...PRINT_KEYS,
    ],
  }),
)

declare module "../../core/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface SettingTable {
    "@matomezu/base:book-theme": typeof BOOK_THEME
    "@matomezu/base:book-paper-color": typeof BOOK_PAPER_COLOR
    "@matomezu/base:book-text-colors": typeof BOOK_TEXT_COLORS
    "@matomezu/base:print-preview-flow": typeof PRINT_PREVIEW_FLOW
    "@matomezu/base:print-preview-order": typeof PRINT_PREVIEW_ORDER
    "@matomezu/base:print-preview-page-numbers": typeof PRINT_PREVIEW_PAGE_NUMBERS
    "@matomezu/base:print-preview-book-name": typeof PRINT_PREVIEW_BOOK_NAME
    "@matomezu/base:print-preview-page-name": typeof PRINT_PREVIEW_PAGE_NAME
  }
  interface UserSettingTable {
    "@matomezu/base:lang": typeof LANG
    "@matomezu/base:tool-picker-hold": typeof TOOL_PICKER_HOLD
    "@matomezu/base:note-expiry": typeof NOTE_EXPIRY
    "@matomezu/base:corner-status-order": typeof CORNER_STATUS_ORDER
    "@matomezu/base:skin": typeof SKIN
    "@matomezu/base:keys": typeof KEYS
    "@matomezu/base:text-colors": typeof USER_TEXT_COLORS
  }
  interface ActionTable {
    "@matomezu/base:book-create": typeof BOOK_CREATE
    "@matomezu/base:page-add": typeof PAGE_ADD
    "@matomezu/base:book-update": typeof BOOK_UPDATE
    "@matomezu/base:page-update": typeof PAGE_UPDATE
    "@matomezu/base:page-move": typeof PAGE_MOVE
    "@matomezu/base:page-remove": typeof PAGE_REMOVE
    "@matomezu/base:page-lock": typeof PAGE_LOCK
    "@matomezu/base:page-unlock": typeof PAGE_UNLOCK
    "@matomezu/base:book-lock": typeof BOOK_LOCK
    "@matomezu/base:book-unlock": typeof BOOK_UNLOCK
    "@matomezu/base:book-trash": typeof BOOK_TRASH
    "@matomezu/base:book-restore": typeof BOOK_RESTORE
    "@matomezu/base:book-purge": typeof BOOK_PURGE
    "@matomezu/base:trash-empty": typeof TRASH_EMPTY
    "@matomezu/base:settings-set": typeof SETTINGS_SET
    "@matomezu/base:book-revert": typeof HISTORY_RESTORE
    "@matomezu/base:note-add": typeof NOTE_ADD
    "@matomezu/base:note-update": typeof NOTE_UPDATE
    "@matomezu/base:note-read": typeof NOTE_READ
    "@matomezu/base:note-talked": typeof NOTE_TALKED
    "@matomezu/base:note-remove": typeof NOTE_REMOVE
    "@matomezu/base:mail-send": typeof MAIL_SEND
    "@matomezu/base:mail-seen": typeof MAIL_SEEN
    "@matomezu/base:mail-visited": typeof MAIL_VISITED
    "@matomezu/base:mail-remove": typeof MAIL_REMOVE
    "@matomezu/base:mark-add": typeof MARK_ADD
    "@matomezu/base:mark-read": typeof MARK_READ
    "@matomezu/base:mark-remove": typeof MARK_REMOVE
    "@matomezu/base:print-preview-update": typeof PRINT_PREVIEW_UPDATE
  }
  interface ThemeTable {
    "@matomezu/base:standard": typeof STANDARD
    "@matomezu/base:sticky": typeof STICKY
    "@matomezu/base:simple": typeof SIMPLE
    "@matomezu/base:matomezu": typeof MATOMEZU_THEME
  }
  interface PermissionTable {
    "@matomezu/base:lock": typeof LOCK
  }
  interface AnnotationTable {
    "@matomezu/base:note": typeof NOTE
    "@matomezu/base:mark": typeof MARK
  }
  interface MailTable {
    "@matomezu/base:letter": typeof MAIL_LETTER
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
  }
  interface CommandTable {
    "@matomezu/base:book-new": typeof BOOK_NEW
    "@matomezu/base:undo": typeof UNDO
    "@matomezu/base:redo": typeof REDO
    "@matomezu/base:stage-home": typeof STAGE_HOME
    "@matomezu/base:stage-split": typeof STAGE_SPLIT
    "@matomezu/base:stage-unsplit": typeof STAGE_UNSPLIT
    "@matomezu/base:stage-close": typeof STAGE_CLOSE
    "@matomezu/base:tool-next": typeof TOOL_NEXT
    "@matomezu/base:tool-set": typeof TOOL_SET
    "@matomezu/base:tool-picker": typeof TOOL_PICKER
    "@matomezu/base:zoom-in": typeof ZOOM_IN
    "@matomezu/base:zoom-out": typeof ZOOM_OUT
    "@matomezu/base:zoom-reset": typeof ZOOM_RESET
    "@matomezu/base:zoom-fit": typeof ZOOM_FIT
    "@matomezu/base:zoom-wheel": typeof ZOOM_WHEEL
    "@matomezu/base:toolbox-cancel": typeof TOOLBOX_CANCEL
    "@matomezu/base:dialog-submit": typeof DIALOG_SUBMIT
    "@matomezu/base:dialog-close": typeof DIALOG_CLOSE
    "@matomezu/base:menu-close": typeof MENU_CLOSE
    "@matomezu/base:book-open": typeof BOOK_OPEN
    "@matomezu/base:page-new": typeof PAGE_NEW
    "@matomezu/base:page-open": typeof PAGE_OPEN
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS
    "@matomezu/base:print-preview-open": typeof PRINT_PREVIEW_OPEN
    "@matomezu/base:print-preview-fit": typeof PRINT_PREVIEW_FIT
    "@matomezu/base:print": typeof PRINT
    "@matomezu/base:settings-set": typeof SETTINGS_SET_COMMAND
    "@matomezu/base:settings-open": typeof SETTINGS_OPEN
    "@matomezu/base:note-new": typeof NOTE_NEW
    "@matomezu/base:mark-new": typeof MARK_NEW
    "@matomezu/base:right-side-panel-close": typeof RIGHT_SIDE_PANEL_CLOSE
    "@matomezu/base:left-side-panel-close": typeof LEFT_SIDE_PANEL_CLOSE
  }
  interface KeyScopeTable {
    "@matomezu/base:right-side-panel": typeof RIGHT_SIDE_PANEL_KEY_SCOPE // 右サイドパネルの中にフォーカスがある間のキー
    "@matomezu/base:left-side-panel": typeof LEFT_SIDE_PANEL_KEY_SCOPE // 左サイドパネルの中にフォーカスがある間のキー
  }
  interface DialogTable {
    "@matomezu/base:mail": typeof MAIL_DIALOG
    "@matomezu/base:book-new": typeof NEW_BOOK_DIALOG
    "@matomezu/base:book-open": typeof OPEN_BOOK_DIALOG
    "@matomezu/base:page-new": typeof NEW_PAGE_DIALOG
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS_DIALOG
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS_DIALOG
    "@matomezu/base:settings": typeof SETTINGS_DIALOG
  }
}
