// プラグイン API の入口 matomezu（React なし）: プラグイン API（plugin-api）の名前を外に出す。機能台帳の型の側への書き足しは matomezu/catalog（core/catalog.ts）に向ける

// zod は matomezu の実物を使う（追加プラグインが自分で入れた zod は使わない）
export { z } from "zod"
export * from "../plugin-api"
