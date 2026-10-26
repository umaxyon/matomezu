// プラグイン API の入口 matomezu/ui: プラグイン API の見た目の側（plugin-api/ui）の名前と、base のダイアログの枠を外に出す

export * from "../plugin-api/ui"
export { Confirm, Dialog } from "../plugins/base/ui"

// ビルトインプラグインの見た目が機能台帳の型の側に書き足した物（右クリックのメニューなど）も、いつも型に含める
import type {} from "../plugins/ui"
