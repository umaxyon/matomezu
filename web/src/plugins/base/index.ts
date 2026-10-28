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
import type { A3, A4, A5, LETTER, TABLOID } from "./looks/papers"
import { MINIMAP_TOGGLE } from "./minimap"
import { NEW_PAGE_DIALOG, PAGE_ADD, PAGE_NEW, PAGE_OPEN, PAGE_SETTINGS, PAGE_SETTINGS_DIALOG } from "./page-tabs"
import { PAGE_REMOVE } from "./page-tabs/page-remove"
import { PAGE_UPDATE } from "./page-tabs/page-update"
import { FAMILY_TITLE_CHECK, PROP_NAMES_CHECK } from "./place/items"
import {
  SET_KEYS,
  SET_LANG,
  SET_SKIN,
  SET_TEXT_COLORS,
  SETTINGS_LANG,
  SETTINGS_SKIN,
  SETTINGS_TEXT_COLOR,
} from "./settings"
import { STAGE_CLOSE, STAGE_HOME, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage"
import { BOOK_TEXT_COLORS, TEXT_COLORS } from "./text"
import { TOOL_PICKER, TOOL_PICKER_KEYS, TOOL_SET } from "./tool-picker"
import { TOOL_NEXT } from "./tool-switch"
import { HAND_TOOL, SELECT_TOOL } from "./tool-switch/tools"
import { TOOLBOX_CANCEL, TOOLBOX_KEYS } from "./toolbox"
import { ZOOM_IN, ZOOM_KEYS, ZOOM_OUT, ZOOM_RESET } from "./zoom"

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
export type { PageProblem } from "./page-tabs/page-problems"
export type { Frame } from "./place/frame"
export {
  CHILD_AREA,
  childOrigin,
  commitChildren,
  frameAround,
  frameOf,
  placeChild,
  replaceChild,
  settleChildren,
  toData,
} from "./place/frame"
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
  replaceShape,
  replaceShapePushing,
  resizedBy,
  rootOf,
  shapeDefOf,
  shownRects,
  unpinPage,
  widenForCaption,
  withPage,
} from "./place/items"
export type { PortArea, Ports } from "./place/placed"
export { NEST_PADDING, placedSize, portAreasOf, rectsOf } from "./place/placed"
export type { Axis, Gap } from "./place/push"
export { apart, evenGap, inPaper, LEN, newClash, tooClose } from "./place/push"
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
  textColorsOf,
  wrapRich,
} from "./text"
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
export { toolboxOf } from "./toolbox/toolbox"
// プラグインに公開する共通の処理（utils。ビルトインプラグインもここから使う）
export * from "./utils"
export { NEW_PAGE_DIALOG, OPEN_BOOK_DIALOG }

export const BASE = defineBuiltin(
  kit.plugin({
    actions: [
      PAGE_ADD,
      PAGE_UPDATE,
      PAGE_REMOVE,
      BOOK_UPDATE,
      BOOK_CREATE,
      SET_LANG,
      SET_SKIN,
      SET_KEYS,
      SET_TEXT_COLORS,
    ],
    settings: [BOOK_THEME, BOOK_PAPER_COLOR, BOOK_TEXT_COLORS],
    themes: [STANDARD, STICKY, SIMPLE],
    papers: PAPERS,
    textColors: TEXT_COLORS,
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
      ZOOM_IN,
      ZOOM_OUT,
      ZOOM_RESET,
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
      SETTINGS_TEXT_COLOR,
    ],
    dialogs: [OPEN_BOOK_DIALOG, NEW_PAGE_DIALOG, PAGE_SETTINGS_DIALOG, BOOK_SETTINGS_DIALOG, NEW_BOOK_DIALOG],
    keys: [...TOOLBOX_KEYS, ...TOOL_PICKER_KEYS, ...ZOOM_KEYS, ...DIALOG_KEYS, ...MENU_KEYS],
  }),
)

declare module "../../core/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface SettingTable {
    "@matomezu/base:book-theme": typeof BOOK_THEME
    "@matomezu/base:book-paper-color": typeof BOOK_PAPER_COLOR
    "@matomezu/base:text-colors": typeof BOOK_TEXT_COLORS
  }
  interface ActionTable {
    "@matomezu/base:book-create": typeof BOOK_CREATE
    "@matomezu/base:page-add": typeof PAGE_ADD
    "@matomezu/base:book-update": typeof BOOK_UPDATE
    "@matomezu/base:page-update": typeof PAGE_UPDATE
    "@matomezu/base:page-remove": typeof PAGE_REMOVE
    "@matomezu/base:settings-lang": typeof SET_LANG
    "@matomezu/base:settings-skin": typeof SET_SKIN
    "@matomezu/base:settings-keys": typeof SET_KEYS
    "@matomezu/base:settings-text-colors": typeof SET_TEXT_COLORS
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
    "@matomezu/base:stage-home": typeof STAGE_HOME
    "@matomezu/base:stage-split": typeof STAGE_SPLIT
    "@matomezu/base:stage-unsplit": typeof STAGE_UNSPLIT
    "@matomezu/base:stage-close": typeof STAGE_CLOSE
    "@matomezu/base:tool-next": typeof TOOL_NEXT
    "@matomezu/base:tool-set": typeof TOOL_SET
    "@matomezu/base:tool-picker": typeof TOOL_PICKER
    "@matomezu/base:minimap-toggle": typeof MINIMAP_TOGGLE
    "@matomezu/base:zoom-in": typeof ZOOM_IN
    "@matomezu/base:zoom-out": typeof ZOOM_OUT
    "@matomezu/base:zoom-reset": typeof ZOOM_RESET
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
    "@matomezu/base:settings-text-color": typeof SETTINGS_TEXT_COLOR
  }
  interface DialogTable {
    "@matomezu/base:book-new": typeof NEW_BOOK_DIALOG
    "@matomezu/base:book-open": typeof OPEN_BOOK_DIALOG
    "@matomezu/base:page-new": typeof NEW_PAGE_DIALOG
    "@matomezu/base:page-settings": typeof PAGE_SETTINGS_DIALOG
    "@matomezu/base:book-settings": typeof BOOK_SETTINGS_DIALOG
  }
}
