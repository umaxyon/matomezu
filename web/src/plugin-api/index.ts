// プラグイン API（React なし）: 追加プラグインとビルトインプラグインが使ってよい名前を、土台（core・store）から出し直すだけの層。
// 外から読む入口は plugin-entry（matomezu）。名前の一覧は test/plugin-api.test.ts

export type { PagedBook } from "../core/book"
export { bookItems, creatableTypes, createBook, hasPages, pagedOf, putPage } from "../core/book"
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
  SingleBookTypeId,
  SkinId,
  SlotId,
  ThemeId,
  WidgetId,
} from "../core/catalog"
export { HEX, isLight, isPaletteName, PALETTE } from "../core/color"
export type { CoreCatalog, ItemProps } from "../core/core-catalog"
export { bookType } from "../core/core-catalog"
export type { ActionDef } from "../core/def/action"
export { defineAction } from "../core/def/action"
export type { BookTypeDef } from "../core/def/book-type"
export { defineBookType } from "../core/def/book-type"
export type {
  ConnectorData,
  ItemDef,
  ShapeAddArgs,
  ShapeData,
  ShapeEditArgs,
} from "../core/def/item"
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
export { defineTheme, themeVar } from "../core/def/theme"
export type { Point, Rect, Size } from "../core/geom"
export { defineMessages } from "../core/i18n/messages"
export type { Owned } from "../core/names"
export { actionsOf } from "../core/perform"
export type { ItemPage, PlacedConnector, PlacedOf, PlacedShape } from "../core/placed"
export {
  connectableShape,
  connectorSchema,
  connectorsOf,
  pageItemsOf,
  shapeSchema,
  shapesOf,
} from "../core/placed"
export type { Book } from "../core/schema/book"
export type { Stage } from "../core/stage"
export { paperOf, placement, toPaper, toPaperDelta } from "../core/stage"
export { resolveTokens } from "../core/theme"
export type { StageView } from "../core/workspace"
export { toolOf } from "../core/workspace"
export type { CommandContext } from "../store/commands/def"
export { defineCommand } from "../store/commands/def"
export type { PageSettingsArgs } from "../store/dialogs"
export { defineDialog, defineDialogWith, shapeDialogs } from "../store/dialogs"
export type { OwnedMessages } from "../store/kit"
export { pluginKit } from "../store/kit"
export type { Plugin } from "../store/plugin"
export { definePlugin } from "../store/plugin"
