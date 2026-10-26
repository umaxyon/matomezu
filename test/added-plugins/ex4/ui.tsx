// ex4 の見た目を結ぶ: 関係線の層と〇
import { definePluginUi } from "matomezu/ui"
import { EX4 } from "."
import { RelationLayer, RelationPort } from "./views"

export const EX4_UI = definePluginUi(EX4, {
  connectors: { "ex4:relation": { layer: RelationLayer, overlay: RelationPort } },
})

export default EX4_UI
