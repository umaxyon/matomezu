// プラグイン API の見た目の側: 追加プラグインとビルトインプラグインが見た目を結ぶのに使ってよい名前を、土台（ui）から出し直すだけの層。
// 外から読む入口は plugin-entry（matomezu/ui）。状態を丸ごと読むフックは出さない

export { useCommand } from "../ui/commands"
export type { ConnectorUi, ShapeScene } from "../ui/connector"
export { ShapeMarksContext, useShapeMarks } from "../ui/connector"
export { useContextMenu } from "../ui/context-menu"
export { useT } from "../ui/i18n"
export { defineLayout, defineWidget } from "../ui/layout"
export type { BookViewDef, BookViewProps, DialogProps, ItemUi, ItemViewProps, SettingControlProps } from "../ui/plugin"
export { definePluginUi } from "../ui/plugin"
export { useActions } from "../ui/store-context"
export { themeVars } from "../ui/theme-vars"
