// プラグイン API（React なし）: 追加プラグインとビルトインプラグインが使ってよい名前を、土台（core・store）から出し直すだけの層。
// 外から読む入口は plugin-entry（matomezu）。名前の一覧は test/plugin-api.test.ts

export type { PagedBook } from "../core/book"
export { bookItems, creatableTypes, createBook, hasPages, pagedOf, putPage } from "../core/book"
export { settingValue } from "../core/book-settings"
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
export type { ConnectorData, ItemDef, ShapeAddArgs, ShapeEditArgs } from "../core/def/item"
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
export { defineLanguagePack, defineMessages } from "../core/i18n/messages"
export { actionsOf } from "../core/perform"
export type { Edges } from "../core/place/items"
export {
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
  widenForCaption,
  withPage,
} from "../core/place/items"
export type { Axis, Gap } from "../core/place/push"
export { apart, evenGap, inPaper, LEN, newClash, tooClose } from "../core/place/push"
export type { ItemPage, PlacedConnector, PlacedOf, PlacedShape } from "../core/placed"
export {
  connectableShape,
  connectorSchema,
  connectorsOf,
  pageItemsOf,
  placedSize,
  rectsOf,
  shapeSchema,
  shapesOf,
} from "../core/placed"
export type { Book } from "../core/schema/book"
export type { Stage } from "../core/stage"
export { paperOf, placement, toPaper, toPaperDelta } from "../core/stage"
export {
  AlignSchema,
  BODY_MAX,
  captionTextWidth,
  PLACE_LINES,
  TEXT_LOOK,
  textNew,
  textPatch,
  textProps,
} from "../core/text/fields"
export { clampLines, wrap } from "../core/text/text"
export { BookLookSchema, resolveTokens } from "../core/theme"
export { toolOf } from "../core/workspace"
export type { CommandContext } from "../store/commands/def"
export { defineCommand } from "../store/commands/def"
export { defineDialog, defineDialogWith, shapeDialogs } from "../store/dialogs"
export { defineKeys } from "../store/keys"
export type { Plugin } from "../store/plugin"
export { defineBuiltin, definePlugin } from "../store/plugin"
