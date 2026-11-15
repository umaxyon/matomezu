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
  BookViewDef,
  BookViewProps,
  DialogProps,
  EnumValueIcon,
  ItemUi,
  ItemViewProps,
  SettingControlProps,
  UserSettingControlProps,
} from "../ui/plugin"
export { definePluginUi } from "../ui/plugin"
export { ScreenView } from "../ui/ScreenView"
export { Slot } from "../ui/Slot"

import type { LegacyOnly } from "../core/legacy"
import { useActions as useStoreActions } from "../ui/store-context"

export { useLayoutWarnings } from "../ui/store-context"
// 橋渡しの間だけ: 場所を第 1 引数に取る操作。プラグインは useActionsHere を使う（最後に、それを useActions にする）
export const useActions: LegacyOnly<typeof useStoreActions> = useStoreActions as never
export { TokenScope, themeVars, useTokenScope } from "../ui/theme-vars"
export {
  type Allowed,
  useActionsHere,
  useAllowed,
  useAllowedOn,
  useBook,
  useBrowserBack,
  useCoreCatalog,
  useItem,
  useItemAt,
  useLatestPan,
  usePage,
  usePerform,
  usePluginState,
  useReadPluginState,
  useRecord,
  useRecords,
  useScreen,
  useScreenId,
  useScreens,
  useSetPluginState,
  useSetPluginStateById,
  useSetPluginStates,
  useSettings,
  useShownBook,
  useShownPage,
  useStage,
  useStageArea,
  useStagePan,
  useToPaper,
  useUiCatalog,
  useUpdatePluginState,
  useUserSetting,
} from "../ui/view-hooks"
