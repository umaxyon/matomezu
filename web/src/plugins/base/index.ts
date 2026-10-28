// base（ほかのプラグインが読んでよいプラグイン）: ステージ（ホームを開く・分割・閉じる）・道具の切り替え（回転ボタンと、長押しで出すアイコン）・置くのの取り消し・ダイアログと右クリックのメニューを閉じる・ブックを開く・ページ・紙・設定・標準のテーマ・スキン（ダーク・ライト）と、そのキーの既定の割り当て。
// 機能ごとのフォルダの定義を集めて 1 つのプラグインにする。画面の骨組みのウィジェット（ui.tsx）がここのコマンドを呼ぶ
import { defineBuiltin } from "../../store/plugin"
import { BOOK_PAPER_COLOR, BOOK_SETTINGS, BOOK_SETTINGS_DIALOG, BOOK_THEME, BOOK_UPDATE } from "./book-look"
import { BOOK_CREATE, BOOK_NEW, NEW_BOOK_DIALOG } from "./book-new"
import { BOOK_OPEN, OPEN_BOOK_DIALOG } from "./book-open"
import { MENU_CLOSE, MENU_KEYS } from "./context-menu"
import { DIALOG_CLOSE, DIALOG_KEYS, DIALOG_SUBMIT } from "./dialog-host"
import { kit } from "./kit"
import { DARK, LIGHT, PAPERS, SIMPLE, STANDARD, STICKY } from "./looks"
import type { A3, A4, A5 } from "./looks/papers"
import { MINIMAP_TOGGLE } from "./minimap"
import { NEW_PAGE_DIALOG, PAGE_ADD, PAGE_NEW, PAGE_OPEN, PAGE_SETTINGS, PAGE_SETTINGS_DIALOG } from "./page-tabs"
import { PAGE_UPDATE } from "./page-tabs/page-update"
import { FAMILY_TITLE_CHECK, PROP_NAMES_CHECK } from "./place/items"
import { SET_KEYS, SET_LANG, SET_SKIN, SETTINGS_LANG, SETTINGS_SKIN } from "./settings"
import { STAGE_CLOSE, STAGE_HOME, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage"
import { TOOL_PICKER, TOOL_PICKER_KEYS, TOOL_SET } from "./tool-picker"
import { TOOL_NEXT } from "./tool-switch"
import { HAND_TOOL, SELECT_TOOL } from "./tool-switch/tools"
import { TOOLBOX_CANCEL, TOOLBOX_KEYS } from "./toolbox"

export { BOOK_PAPER_COLOR, BOOK_THEME } from "./book-look"
export { NEW_BOOK_DIALOG } from "./book-new"
export { createBookIn } from "./book-new/create-book"
export type { PageContext } from "./book-settings"
export { pageContext, settingValue } from "./book-settings"
export { PAPER_IDS, PAPERS } from "./looks"
// 拡張ポイントに書き足した物の型（定義を書くプラグインが使う。追加プラグインには matomezu から出す）
export type { MinimapMark } from "./minimap/marks"
export { addPageIn } from "./page-tabs/add-page"
export { type PageFieldsWay, pageFieldsWay } from "./page-tabs/page-fields"
// 置く計算と文字（ほかのプラグインが使う。追加プラグインには matomezu から出す）
export type { Edges, GrowFrom } from "./place/items"
export {
  adaptPage,
  extentOf,
  fitsPaper,
  gapOf,
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
  resizedBy,
  shapeDefOf,
  shownRects,
  unpinPage,
  widenForCaption,
  withPage,
} from "./place/items"
export type { PortArea, Ports } from "./place/placed"
export { placedSize, portAreasOf, rectsOf } from "./place/placed"
export type { Axis, Gap } from "./place/push"
export { apart, evenGap, inPaper, LEN, newClash, tooClose } from "./place/push"
export {
  AlignSchema,
  BODY_MAX,
  captionTextWidth,
  PLACE_LINES,
  TEXT_LOOK,
  textNew,
  textPatch,
  textProps,
} from "./text/fields"
export type { Font, Weight } from "./text/text"
export { clampLines, textWidth, wrap } from "./text/text"
export { toolboxOf } from "./toolbox/toolbox"
// プラグインに公開する共通の処理（utils。ビルトインプラグインもここから使う）
export * from "./utils"
export { NEW_PAGE_DIALOG, OPEN_BOOK_DIALOG }

export const BASE = defineBuiltin(
  kit.plugin({
    actions: [PAGE_ADD, PAGE_UPDATE, BOOK_UPDATE, BOOK_CREATE, SET_LANG, SET_SKIN, SET_KEYS],
    settings: [BOOK_THEME, BOOK_PAPER_COLOR],
    themes: [STANDARD, STICKY, SIMPLE],
    papers: PAPERS,
    skins: [DARK, LIGHT],
    tools: [SELECT_TOOL, HAND_TOOL],
    checks: [PROP_NAMES_CHECK, FAMILY_TITLE_CHECK],
    commands: [
      BOOK_NEW,
      STAGE_HOME,
      STAGE_SPLIT,
      STAGE_UNSPLIT,
      STAGE_CLOSE,
      TOOL_NEXT,
      TOOL_SET,
      TOOL_PICKER,
      MINIMAP_TOGGLE,
      TOOLBOX_CANCEL,
      DIALOG_SUBMIT,
      DIALOG_CLOSE,
      MENU_CLOSE,
      BOOK_OPEN,
      PAGE_NEW,
      PAGE_OPEN,
      PAGE_SETTINGS,
      BOOK_SETTINGS,
      SETTINGS_LANG,
      SETTINGS_SKIN,
    ],
    dialogs: [OPEN_BOOK_DIALOG, NEW_PAGE_DIALOG, PAGE_SETTINGS_DIALOG, BOOK_SETTINGS_DIALOG, NEW_BOOK_DIALOG],
    keys: [...TOOLBOX_KEYS, ...TOOL_PICKER_KEYS, ...DIALOG_KEYS, ...MENU_KEYS],
  }),
)

declare module "../../core/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface SettingTable {
    "@matomezu/base:book-theme": typeof BOOK_THEME
    "@matomezu/base:book-paper-color": typeof BOOK_PAPER_COLOR
  }
  interface ActionTable {
    "@matomezu/base:book-create": typeof BOOK_CREATE
    "@matomezu/base:page-add": typeof PAGE_ADD
    "@matomezu/base:book-update": typeof BOOK_UPDATE
    "@matomezu/base:page-update": typeof PAGE_UPDATE
    "@matomezu/base:settings-lang": typeof SET_LANG
    "@matomezu/base:settings-skin": typeof SET_SKIN
    "@matomezu/base:settings-keys": typeof SET_KEYS
  }
  interface ThemeTable {
    "@matomezu/base:standard": typeof STANDARD
    "@matomezu/base:sticky": typeof STICKY
    "@matomezu/base:simple": typeof SIMPLE
  }
  interface ToolTable {
    "@matomezu/base:select": typeof SELECT_TOOL
    "@matomezu/base:hand": typeof HAND_TOOL
  }
  interface SkinTable {
    "@matomezu/base:dark": typeof DARK
    "@matomezu/base:light": typeof LIGHT
  }
  interface PaperTable {
    "@matomezu/base:a5": typeof A5
    "@matomezu/base:a4": typeof A4
    "@matomezu/base:a3": typeof A3
  }
  interface CommandTable {
    "@matomezu/base:book-new": typeof BOOK_NEW
    "@matomezu/base:stage-home": typeof STAGE_HOME
    "@matomezu/base:stage-split": typeof STAGE_SPLIT
    "@matomezu/base:stage-unsplit": typeof STAGE_UNSPLIT
    "@matomezu/base:stage-close": typeof STAGE_CLOSE
    "@matomezu/base:tool-next": typeof TOOL_NEXT
    "@matomezu/base:tool-set": typeof TOOL_SET
    "@matomezu/base:tool-picker": typeof TOOL_PICKER
    "@matomezu/base:minimap-toggle": typeof MINIMAP_TOGGLE
    "@matomezu/base:toolbox-cancel": typeof TOOLBOX_CANCEL
    "@matomezu/base:dialog-submit": typeof DIALOG_SUBMIT
    "@matomezu/base:dialog-close": typeof DIALOG_CLOSE
    "@matomezu/base:menu-close": typeof MENU_CLOSE
    "@matomezu/base:book-open": typeof BOOK_OPEN
    "@matomezu/base:page-new": typeof PAGE_NEW
    "@matomezu/base:page-open": typeof PAGE_OPEN
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS
    "@matomezu/base:settings-lang": typeof SETTINGS_LANG
    "@matomezu/base:settings-skin": typeof SETTINGS_SKIN
  }
  interface DialogTable {
    "@matomezu/base:book-new": typeof NEW_BOOK_DIALOG
    "@matomezu/base:book-open": typeof OPEN_BOOK_DIALOG
    "@matomezu/base:page-new": typeof NEW_PAGE_DIALOG
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS_DIALOG
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS_DIALOG
  }
}
