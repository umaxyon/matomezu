// プラグイン API（React なし）: 追加プラグインとビルトインプラグインが使ってよい名前を、土台（core・store）から出し直すだけのクレート。
// 外から読む入口は plugin-entry（matomezu）。名前の一覧は test/plugin-api.test.ts

export type { Actor } from "../core/actor"
export { isAI, isUser } from "../core/actor"
export type { Annotation, BookAnnotations } from "../core/annotation"
export type { PagedBook } from "../core/book"
export { bookItems, creatableTypes, createBook, hasPages, pagedOf, putPage, withSettings } from "../core/book"
export type {
  ActionId,
  CommandId,
  DialogId,
  ItemId,
  KeyScopeId,
  MessageKey,
  PageTypeId,
  PaperId,
  PresentationId,
  SettingId,
  SkinId,
  SlotId,
  ThemeId,
  WidgetId,
} from "../core/catalog"
export { HEX, isLight, isPaletteName, PALETTE } from "../core/color"
export type { CoreCatalog, ItemProps } from "../core/core-catalog"
export { pageType } from "../core/core-catalog"
export type { ActionContext, ActionDef, Declined, RecordOf, RecordRead } from "../core/def/action"
export type { AnnotationDef } from "../core/def/annotation"
export type { EnumDef, EnumValueDef } from "../core/def/enum"
export type {
  ConnectorData,
  ItemDef,
  ShapeAddArgs,
  ShapeData,
  ShapeEditArgs,
} from "../core/def/item"
export type { PageTypeDef } from "../core/def/page-type"
export { slideIsBackground } from "../core/def/page-type"
export type { PaperDef } from "../core/def/paper"
export type { PluginStateDef } from "../core/def/plugin-state"
export type { PresentationDef } from "../core/def/presentation"
export type { SettingDef } from "../core/def/setting"
export type { SkinDef } from "../core/def/skin"
export type { SubjectDef } from "../core/def/subject"
export type { TextColorDef } from "../core/def/text-color"
export type { ThemeDef } from "../core/def/theme"
export { themeVar } from "../core/def/theme"
export { enumValuesOf } from "../core/enum"
export type { Point, Rect, Size } from "../core/geom"
export { translate } from "../core/i18n/i18n"
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
  slideOf,
  walkShapes,
} from "../core/placed"
export type { Book } from "../core/schema/book"
export { areaOf, paperOf, placement, toPaper, toPaperDelta } from "../core/stage"
export { resolveTokens } from "../core/theme"
export type { WideSearchAnswer, WideSearchHit, WideSearchQuery } from "../core/wide-search"
export type { StageView } from "../core/workspace"
export type { CalledScreen, CommandContext, ScreenCommandContext } from "../store/commands/def"
export type { PageSettingsArgs } from "../store/dialogs"
export { shapeDialogs } from "../store/dialogs"
export type { OwnedMessages } from "../store/kit"
export { pluginKit } from "../store/kit"
export type { Plugin } from "../store/plugin"
export { definePlugin } from "../store/plugin"
