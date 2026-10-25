// プラグイン API の入口 matomezu/ui: 追加プラグインが見た目を結ぶのに使うものだけを出す（ビューの props の型・フック・base のダイアログの枠）
export { Confirm, Dialog } from "../plugins/base/ui"
export { useCommand } from "../ui/commands"
export { useT } from "../ui/i18n"
export { defineWidget } from "../ui/layout"
export type { DialogProps, ItemUi, ItemViewProps, SettingControlProps } from "../ui/plugin"
export { definePluginUi } from "../ui/plugin"
