// プラグイン API（React なし）: 追加プラグインとビルトインプラグインが使ってよい名前を、土台（core・store）から出し直すだけのクレート。
// 外から読む入口は plugin-entry（matomezu）。名前の一覧は test/plugin-api.test.ts

export type { Annotation, BookAnnotations } from "../core/annotation"
export type { PagedBook } from "../core/book"
export { bookItems, creatableTypes, createBook, hasPages, pagedOf, putPage, withSettings } from "../core/book"
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
export type { ActionDef, Declined } from "../core/def/action"
export type { AnnotationDef } from "../core/def/annotation"
export type { BookTypeDef } from "../core/def/book-type"
export type {
  ConnectorData,
  ItemDef,
  ShapeAddArgs,
  ShapeData,
  ShapeEditArgs,
} from "../core/def/item"
export type { PaperDef } from "../core/def/paper"
export type { PresentationDef } from "../core/def/presentation"
export type { SettingDef } from "../core/def/setting"
export type { SkinDef } from "../core/def/skin"
export type { TextColorDef } from "../core/def/text-color"
export type { ThemeDef } from "../core/def/theme"
export { themeVar } from "../core/def/theme"
export type { Point, Rect, Size } from "../core/geom"
export { defineMessages } from "../core/i18n/messages"
export type { Owned } from "../core/names"
export { actionsOf } from "../core/perform"
export type { ItemPage, PlacedConnector, PlacedOf, PlacedShape, ShapeOnPage } from "../core/placed"
export {
  connectableShape,
  connectorSchema,
  connectorsOf,
  findShape,
  pageItemsOf,
  replaceShape,
  shapeSchema,
  shapesOf,
  walkShapes,
} from "../core/placed"
export type { Book } from "../core/schema/book"
export { areaOf, paperOf, placement, toPaper, toPaperDelta } from "../core/stage"
export { resolveTokens } from "../core/theme"
export type { StageView } from "../core/workspace"
export type { CommandContext } from "../store/commands/def"
export type { PageSettingsArgs } from "../store/dialogs"
export { shapeDialogs } from "../store/dialogs"
export type { OwnedMessages } from "../store/kit"
export { pluginKit } from "../store/kit"
export type { Plugin } from "../store/plugin"
export { definePlugin } from "../store/plugin"
