// テストで組む入口 matomezu/testing: 開発者プロジェクトのテストが、ビルトインプラグインと自分のプラグインでインスタンスを作り、UI マッピングを決めて描くのに使うもの。プラグインのコードは読まない（プラグイン API ではない）。
// 作ったインスタンスは、起動したときのホストと同じく書庫を 1 度整える（足りないシステムフォルダを足す。store/settle.ts）

export { stagePlacesOf, withStagePlaces } from "../core/address"
export { BUILTIN, BUILTIN_CONTROL_CENTER } from "../plugins"
export { BUILTIN_UI, DEFAULT_LAYOUT } from "../plugins/ui"
export { WINDOW_PLACE } from "../store/plugin-state"
export { createSettledMatomezu as createMatomezu } from "../store/settle"
export { openedIn } from "../store/store"
export { defineLayout, placeAdded } from "../ui/layout"
export { MatomezuProvider } from "../ui/store-context"
export { WindowRoot } from "../ui/WindowRoot"
