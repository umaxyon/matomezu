// ex10: プラグイン状態（definePluginState）を、画面の場所に入れる物（address が push）として、ステージに結ばない範囲（scope が window）で宣言する追加プラグイン。
// 値は画面の場所（URL）に入って読み直しても戻り、値を変えるたびにブラウザの履歴に積まれる（address が push）ので、戻るで前の値に戻る。ステージに結ばない
import { definePlugin, z } from "matomezu"
import { kit } from "./kit"

// ステージに結ばず見せているタブ。決めるのは宣言する側（積む）
export const EX10_TAB = kit.definePluginState({
  id: "tab",
  scope: "window",
  schema: z.enum(["one", "two"]),
  address: "push",
})

export const EX10 = definePlugin(kit.plugin({ pluginStates: [EX10_TAB] }))

export default EX10

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface PluginStateTable {
    "ex10:tab": typeof EX10_TAB
  }
}
