// テストで組む入口 matomezu/testing: 開発者プロジェクトのテストが、ビルトインプラグインと自分のプラグインでインスタンスを作り、配置を決めて描くのに使うもの。プラグインのコードは読まない（プラグイン API ではない）
export { BUILTIN } from "../plugins"
export { BUILTIN_UI, DEFAULT_LAYOUT } from "../plugins/ui"
export { createMatomezu } from "../store/create"
export { defineLayout, placeAdded } from "../ui/layout"
export { Screen } from "../ui/Screen"
export { MatomezuProvider } from "../ui/store-context"
