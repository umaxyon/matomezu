// ex7 の見た目を結ぶ: 木箱のビュー
import { definePluginUi } from "matomezu/ui"
import { EX7 } from "."
import { CRATE } from "./crate"

const CRATE_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="6" width="16" height="12" />
  </svg>
)

function CrateView({ size }: { size: { w: number; h: number } }) {
  return <div data-ex7-crate style={{ width: size.w, height: size.h }} />
}

export const EX7_UI = definePluginUi(EX7, { items: { [CRATE.id]: { view: CrateView, icon: CRATE_ICON } } })

export default EX7_UI
