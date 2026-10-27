// ex6 の見た目を結ぶ（見た目の無いプラグイン）
import { definePluginUi } from "matomezu/ui"
import { EX6 } from "."

export const EX6_UI = definePluginUi(EX6, {})

export default EX6_UI
