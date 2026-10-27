// ツリーのプラグイン: ツリーのブックのタイプ。見せ方・設定の項目は、ほかのプラグインの定義を id で選ぶ（tree.ts）
import { defineBuiltin } from "../../../plugin-api/builtin"
import { kit } from "./kit"
import { TREE } from "./tree"

export const TREE_PLUGIN = defineBuiltin(
  kit.plugin({
    bookTypes: [TREE],
  }),
)

declare module "../../../core/catalog" {
  interface BookTypeTable {
    "@matomezu/tree:tree": typeof TREE
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
