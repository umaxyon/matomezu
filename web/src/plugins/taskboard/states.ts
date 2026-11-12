// タスクボードの画面の状態（窓の中だけ。読み直すと消える）: 一覧の開閉・レーンごとの並べ方・ボードとレーンの最大化
import { kit } from "./kit"
import type { Maximized } from "./maximize"
import type { SortRules } from "./sort"

// プロジェクトの一覧を開いているか（最初は閉じている）
export const LIST_OPEN = kit.definePluginStateOf<boolean>()({ id: "list-open", scope: "window" })

// レーンごとの並べ方: プロジェクトの id → レーンの id（未分類は unsorted）→ 並べ方（無ければ既定）
export const LANE_SORTS = kit.definePluginStateOf<Readonly<Record<string, Readonly<Record<string, SortRules>>>>>()({
  id: "lane-sorts",
  scope: "window",
})

// 最大化しているボードとレーン（無ければ何も最大化していない）
export const MAXIMIZED = kit.definePluginStateOf<Maximized>()({ id: "maximized", scope: "window" })
