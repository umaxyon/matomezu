// コントロールセンターの枠を退かせる名乗りの持ち方（窓のプラグイン状態。名乗った物の id の並び。読み直すと消える）。フックは maximize.tsx
import { kit } from "../kit"

// 名乗った物が無いときの値
const NO_MAXIMIZERS: readonly string[] = []

export const MAXIMIZERS = kit.definePluginStateOf<readonly string[]>()({
  id: "control-center-maximizers",
  scope: "window",
  default: NO_MAXIMIZERS,
})
