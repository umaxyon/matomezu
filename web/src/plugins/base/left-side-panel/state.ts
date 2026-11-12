// 左サイドパネルを開いているかの、base のプラグイン状態での持ち方（窓に 1 つ）: 開く側が渡した、タブの組（どのタブに何を渡すか）と、開いているタブ。
// 入れ物は渡された物の中身を読まない（渡す物はデータだけ）
import { sameData } from "../../../core/same"
import { kit } from "../kit"

// 開く側が渡す、タブ 1 つ分: タブのウィジェットの id と、そのタブの view に渡す物（関数を含まない、データだけ）
export interface LeftSidePanelEntry {
  tab: string
  props: unknown
}

// 開いている左サイドパネル: 渡されたタブの組と、開いているタブ（組の中のタブの id）
export interface LeftSidePanelOpen {
  entries: readonly LeftSidePanelEntry[]
  tab: string
}

// 窓の左サイドパネル（閉じていれば無い）
export const LEFT_SIDE_PANEL_STATE = kit.definePluginStateOf<LeftSidePanelOpen>()({
  id: "left-side-panel",
  scope: "window",
})

export const LEFT_SIDE_PANEL_STATES = [LEFT_SIDE_PANEL_STATE] as const

// 今開いている物 now に、開く側のタブの組 entries（開きたいタブ tab。無ければ今開いているタブが組にあればそのまま、無ければ最初）で開くボタンを押したあとの左サイドパネル。
// 今と同じ組なら閉じる（undefined）、違えばその組に置き換える
export function pressedLeftSidePanel(
  now: LeftSidePanelOpen | undefined,
  entries: readonly LeftSidePanelEntry[],
  tab?: string,
): LeftSidePanelOpen | undefined {
  if (now && !tab && sameData(now.entries, entries)) return undefined
  return openedLeftSidePanel(now, entries, tab)
}

// 今開いている物 now を、開く側のタブの組 entries に置き換えた左サイドパネル（開くタブは tab、無ければ今のタブが組にあればそのまま、無ければ最初。組が空なら undefined）
export function openedLeftSidePanel(
  now: LeftSidePanelOpen | undefined,
  entries: readonly LeftSidePanelEntry[],
  tab?: string,
): LeftSidePanelOpen | undefined {
  const first = entries[0]
  if (!first) return undefined
  const has = (id: string | undefined) => entries.some(e => e.tab === id)
  return { entries, tab: tab && has(tab) ? tab : has(now?.tab) ? (now?.tab ?? first.tab) : first.tab }
}
