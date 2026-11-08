// コントロールセンターのプラグイン: ビルトインのコントロールセンター。
// インスタンスのコントロールセンターにすると（createMatomezu の controlCenter: CONTROL_CENTER.id）、ブックの一覧などを変えるアクションを許す
import { defineBuiltin } from "../../plugin-api/builtin"
import { CONTROL_CENTER } from "./control-center"
import { kit } from "./kit"

export { CONTROL_CENTER } from "./control-center"

export const CONTROL_CENTER_PLUGIN = defineBuiltin(kit.plugin({ controlCenters: [CONTROL_CENTER] }))

declare module "../../core/catalog" {
  interface ControlCenterTable {
    "@matomezu/control-center:control-center": typeof CONTROL_CENTER
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
