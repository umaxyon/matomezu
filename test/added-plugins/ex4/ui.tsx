// ex4 の見た目を結ぶ: 関係線のビューと〇
import { definePluginUi } from "matomezu/ui"
import { EX4 } from "."
import { RELATION } from "./relation"
import { RelationPort, RelationView } from "./views"

export const EX4_UI = definePluginUi(EX4, {
  connectors: { [RELATION.id]: { view: RelationView, overlay: RelationPort } },
})

export default EX4_UI
