// ex10: 場所に入れる画面の状態（definePlacedState）を窓の外（scope が frame）で宣言する追加プラグイン。
// 値は画面の場所（URL）に入って読み直しても戻り、値を変えるたびにブラウザの履歴に積まれる（browserHistory が push）ので、戻るで前の値に戻る。ステージに結ばない
import { definePlugin, z } from "matomezu"
import { kit } from "./kit"

// 窓の外で見せているタブ。決めるのは宣言する側（積む）
export const EX10_TAB = kit.definePlacedState({
  id: "tab",
  scope: "frame",
  schema: z.enum(["one", "two"]),
  browserHistory: "push",
})

export const EX10 = definePlugin(kit.plugin({ placedStates: [EX10_TAB] }))

export default EX10

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface PlacedStateTable {
    "ex10:tab": typeof EX10_TAB
  }
}
