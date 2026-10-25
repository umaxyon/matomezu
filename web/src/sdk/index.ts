// SDK の入口 matomezu（React なし）: 外のプラグインが定義を書くのに使うものだけを出す。型の表への書き足しは matomezu/tables（core/tables.ts）に向ける
export type { ActionDef } from "../core/def/action"
export { defineAction } from "../core/def/action"
export type { BookTypeDef } from "../core/def/book-type"
export { defineBookType } from "../core/def/book-type"
export type { ItemDef } from "../core/def/item"
export { defineConnector, defineShape } from "../core/def/item"
export type { PaperDef } from "../core/def/paper"
export { definePaper } from "../core/def/paper"
export type { PresentationDef } from "../core/def/presentation"
export { definePresentation } from "../core/def/presentation"
export type { SettingDef } from "../core/def/setting"
export { defineSetting } from "../core/def/setting"
export type { SkinDef } from "../core/def/skin"
export { defineSkin } from "../core/def/skin"
export type { ThemeDef } from "../core/def/theme"
export { defineTheme } from "../core/def/theme"
export type { Point, Rect, Size } from "../core/geom"
export { defineLanguagePack, defineMessages } from "../core/i18n/messages"
export type {
  ActionId,
  BookTypeId,
  CommandId,
  DialogId,
  ItemId,
  KeyScopeId,
  MessageKey,
  PaperId,
  PresentationId,
  SettingId,
  SkinId,
  SlotId,
  ThemeId,
  WidgetId,
} from "../core/tables"
export { BookLookSchema } from "../core/theme"
export { defineCommand } from "../store/commands/def"
export { defineDialog, defineDialogWith } from "../store/dialogs"
export { defineKeys } from "../store/keys"
export type { Plugin } from "../store/plugin"
export { definePlugin } from "../store/plugin"
