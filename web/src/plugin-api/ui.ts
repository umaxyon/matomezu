// プラグイン API の見た目の側: 追加プラグインとビルトインプラグインが見た目を結ぶのに使ってよい名前を、土台（ui）から出し直すだけの層。
// 外から読む入口は plugin-entry（matomezu/ui）。状態を丸ごと読むフックは出さない

export { useCommand } from "../ui/commands"
export type { ConnectorUi, ShapeScene } from "../ui/connector"
export { ShapeMarksProvider, useShapeMarks } from "../ui/connector"
export { useContextMenu } from "../ui/context-menu"
export { useMessages, useT } from "../ui/i18n"
export type { ContextMenuEntry, LayoutDef, MenuItem, WidgetDef } from "../ui/layout"
export { defineLayout, defineWidget } from "../ui/layout"
export { useMenu, useMenuCommand } from "../ui/menu"
export type {
  BookViewDef,
  BookViewProps,
  DialogProps,
  ItemUi,
  ItemViewProps,
  SettingControlProps,
  UserSettingControlProps,
} from "../ui/plugin"
export { definePluginUi } from "../ui/plugin"
export { Slot } from "../ui/Slot"
export { useActions, useLayoutWarnings } from "../ui/store-context"
export { TokenScope, themeVars, useTokenScope } from "../ui/theme-vars"
export {
  type Allowed,
  useAllowed,
  useBook,
  useCoreCatalog,
  useItem,
  usePage,
  usePerform,
  useSettings,
  useShownBook,
  useShownPage,
  useStage,
  useUiCatalog,
  useUserSetting,
} from "../ui/view-hooks"
