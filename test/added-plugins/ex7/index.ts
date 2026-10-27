// ex7: ex6 の重さのメソッドに答える形を持つ追加プラグイン。ex6 の連携ポイント ex6-spec を型だけ読み、
// ex6 が拡張ポイントに書き足したメソッド "ex6:weight" を書く（ex6 の本体は読まない）
import type {} from "ex6-spec"
import { definePlugin } from "matomezu"
import { CRATE, YARD } from "./crate"
import { kit } from "./kit"

export const EX7 = definePlugin(kit.plugin({ bookTypes: [YARD], items: [CRATE] }))

export default EX7

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex7:yard": typeof YARD
  }
  interface ItemTable {
    "ex7:crate": typeof CRATE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
