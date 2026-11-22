// プラグイン API の見た目の側: 追加プラグインとビルトインプラグインが見た目を結ぶのに使ってよい名前を、土台（ui）から出し直すだけのクレート。
// 外から読む入口は plugin-entry（matomezu/ui）。状態を丸ごと読むフックは出さない

export { useCommand } from "../ui/commands"
export type { ConnectorUi, ShapeScene } from "../ui/connector"
export { ShapeMarksProvider, useShapeMarks } from "../ui/connector"
export { useContextMenu } from "../ui/context-menu"
export { useMessages, useT } from "../ui/i18n"
export type { ContextMenuEntry, LayoutDef, MenuItem, WidgetDef, WidgetPlace } from "../ui/layout"
export { defineLayout, defineWidget } from "../ui/layout"
export { useMenu, useMenuCommand } from "../ui/menu"
export type {
  ContextMenuRow,
  ContextMenuRows,
  DialogProps,
  EnumValueIcon,
  ItemUi,
  ItemViewProps,
  PresentationViewDef,
  PresentationViewProps,
  SettingControlProps,
  UserSettingControlProps,
} from "../ui/plugin"
export { definePluginUi } from "../ui/plugin"
export {
  usePluginState,
  useReadPluginState,
  useSetPluginState,
  useSetPluginStateById,
  useSetPluginStates,
  useUpdatePluginState,
} from "../ui/plugin-state-hooks"
export { useRecord, useRecords } from "../ui/record-hooks"
export { ScreenView } from "../ui/ScreenView"
export { Slot } from "../ui/Slot"
export {
  useArrangedScreens,
  useBrowserBack,
  useReplaceHistory,
  useScreen,
  useScreenArrangement,
  useScreenHere,
  useScreens,
} from "../ui/screen-hooks"
export { useLayoutWarnings } from "../ui/store-context"
export { TokenScope, themeVars, useTokenScope } from "../ui/theme-vars"
export {
  type Allowed,
  useActions,
  useAllowed,
  useAllowedOn,
  useBinder,
  useBook,
  useCoreCatalog,
  useItem,
  useLatestPan,
  usePage,
  usePageById,
  usePerform,
  useSettings,
  useShownBook,
  useShownPage,
  useStage,
  useStageArea,
  useStagePan,
  useToPaper,
  useUiCatalog,
  useUserSetting,
} from "../ui/view-hooks"
