// タスクボードの画面の状態（窓の中だけ。読み直すと消える）: レーンごとの並べ方・タスクボードとレーンの最大化・鳥のチケットカードへの立ち寄り
import { kit } from "../kit"
import type { Maximized } from "./maximize"
import type { SortRules } from "./sort"
import type { CardVisit } from "./visit"

// レーンごとの並べ方: プロジェクトの id → レーンの id（未分類は unsorted）→ 並べ方（無ければ既定）
type LaneSorts = Readonly<Record<string, Readonly<Record<string, SortRules>>>>
// 並べ方を変えたレーンが無いときの値
const NO_LANE_SORTS: LaneSorts = {}
export const LANE_SORTS = kit.definePluginStateOf<LaneSorts>()({
  id: "lane-sorts",
  scope: "window",
  default: NO_LANE_SORTS,
})

// 最大化しているタスクボードとレーン（無ければ何も最大化していない）
export const MAXIMIZED = kit.definePluginStateOf<Maximized>()({ id: "maximized", scope: "window" })

// 鳥がチケットカードに立ち寄っているか（無ければ立ち寄りなし）
export const CARD_VISIT = kit.definePluginStateOf<CardVisit>()({ id: "card-visit", scope: "window" })

export { PROJECT_ORDER, SHOWN_PROJECTS } from "./user-settings"
