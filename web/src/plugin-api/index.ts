// プラグイン API（React なし）: 追加プラグインとビルトインプラグインが使ってよい名前を、土台（core・store）から出し直すだけのクレート。
// 外から読む入口は plugin-entry（matomezu）。名前の一覧は test/plugin-api.test.ts

export type { Actor } from "../core/actor"
export { isAI, isUser, isVisitor, NO_WORKROOM, workroomOfActor } from "../core/actor"
export type { Anchors, Annotation, PageAnnotations } from "../core/annotation"
export { NO_ASSET_URL } from "../core/assets"
export type { PageInto } from "../core/book"
export {
  addBinder,
  addPage,
  allowedItems,
  bindersOf,
  findBinder,
  findPage,
  lineupOf,
  moveEntry,
  NO_BINDER,
  pagesIn,
  pagesOf,
  putBinder,
  putPage,
  removeBinder,
  removePage,
  siblingsOf,
  withSettings,
} from "../core/book"
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
export { type Clipboard, type ClipboardUse, NO_CLIP_DATA, NO_CLIPBOARD, OTHER_HOST } from "../core/clipboard"
export { HEX, isLight, isPaletteName, PALETTE } from "../core/color"
export type { CoreCatalog, ItemProps } from "../core/core-catalog"
export { pageType } from "../core/core-catalog"
export type {
  ActionContext,
  ActionDef,
  AIMessage,
  AIMessageNoRecipient,
  Declined,
  RecordOf,
  RecordRead,
} from "../core/def/action"
export { ANY_PAGE_TYPE, NO_CONTROL_CENTER } from "../core/def/action"
export type { AnnotationDef } from "../core/def/annotation"
export type { EnumDef, EnumValueDef } from "../core/def/enum"
export type {
  BackyardFollow,
  FollowContext,
  FollowedChange,
  FollowedRecord,
  FollowOut,
  FollowStepDef,
  HostMessage,
  WatchesHaving,
} from "../core/def/follow-step"
export type {
  ConnectorData,
  ItemDef,
  ShapeAddArgs,
  ShapeData,
  ShapeEditArgs,
} from "../core/def/item"
export type { LibraryAppearanceDef } from "../core/def/library-appearance"
export type { PageTypeDef } from "../core/def/page-type"
export { slideIsBackground } from "../core/def/page-type"
export type { PaperDef } from "../core/def/paper"
export type { PermissionDef, PermissionInput } from "../core/def/permission"
export {
  NO_STATE,
  type PluginStateDef,
  type PluginStateRead,
  type StateChange,
  type StateOf,
  type StateRead,
} from "../core/def/plugin-state"
export type { PresentationDef } from "../core/def/presentation"
export { NOT_SET, type SettingDef, settingOr } from "../core/def/setting"
export type { SkinDef } from "../core/def/skin"
export type { SubjectDef } from "../core/def/subject"
export { PAIRED_HOST_LISTED, PAIRED_HOST_RALLY_LIMIT, PAIRED_HOST_REQUESTS } from "../core/def/subject"
export type { SystemFolderDef } from "../core/def/system-folder"
export type { TextColorDef } from "../core/def/text-color"
export type { ThemeDef } from "../core/def/theme"
export { themeVar } from "../core/def/theme"
export { freeTitle, IN_BACKYARD, NO_NAME, TITLE_TAKEN } from "../core/entries"
export { enumValuesOf } from "../core/enum"
export type { BackyardEntry, BinderFolder, BookFolder, EntryRef, Folder, WorkKey } from "../core/folders"
// 書庫ホームとゴミ箱の id（どのマシンでも同じ）
export { HOME_ID, TRASH_ID } from "../core/folders"
// ステージエントリが無いときの値（useOutermostOf）・エントリを入れているフォルダの列
export { foldersOver, NO_OUTERMOST } from "../core/folders-tree"
export { type Point, type Rect, type Size, within } from "../core/geom"
export { translate } from "../core/i18n/i18n"
export { defineMessages } from "../core/i18n/messages"
export type { Owned } from "../core/names"
export type { ItemPage, PlacedConnector, PlacedOf, PlacedShape, ShapeOnPage, ShapeParent } from "../core/placed"
export {
  connectableShape,
  connectorSchema,
  connectorsOf,
  findShape,
  NO_ITEM,
  PAGE_ITSELF,
  pageItemsOf,
  replaceShape,
  shapeSchema,
  shapesOf,
  slideOf,
  walkShapes,
} from "../core/placed"
// レコードが無いときの値（useRecord・アクションの文脈の record）
export { NO_RECORD } from "../core/records"
export type { Book, StageLineup } from "../core/schema/book"
export { LISTED_WORKROOMS, type WakeReach } from "../core/settings"
export {
  areaOf,
  binderOf,
  NO_AREA,
  NO_ORIGIN,
  NO_PAGE_TYPE,
  NO_PAPER,
  NO_PLACING,
  NO_PROPS,
  NO_SHIFT,
  NO_STAGE,
  NOTHING_OPENED,
  openedPage,
  paperOf,
  placement,
  shownPageId,
  shownType,
  toPaper,
  toPaperDelta,
} from "../core/stage"
export { NO_TOOL } from "../core/tools"
export type { WideSearchAnswer, WideSearchHit, WideSearchQuery } from "../core/wide-search"
export type { StageView } from "../core/workspace"
export type { CalledScreen, CommandContext, ScreenCommandContext } from "../store/commands/def"
export { NO_BOOK, NO_OUTSIDE_BINDER, NO_PAGE } from "../store/commands/def"
export type { NewPageDialogArgs, PageSettingsArgs } from "../store/dialogs"
export { NO_DIALOG, NO_DIALOG_PREVIEW, shapeDialogs } from "../store/dialogs"
export type { OwnedMessages } from "../store/kit"
export { pluginKit } from "../store/kit"
export type { Plugin } from "../store/plugin"
export { definePlugin } from "../store/plugin"
export type { ContextUse } from "../store/state"
