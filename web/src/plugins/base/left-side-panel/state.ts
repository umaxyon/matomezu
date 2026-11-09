// 左サイドパネルを開いているかの、base の窓の外観枠の状態での持ち方: 開く側が渡した、タブの組（どのタブに何を渡すか）と、開いているタブ。
// 入れ物は渡された物の中身を読まない（渡す物はデータだけ）
import { sameData } from "../../../core/same"
import { nullableItem } from "../utils/state-item"

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

const LEFT_SIDE_PANEL = nullableItem<LeftSidePanelOpen>("leftSidePanel")

// 外観枠の状態 frame で開いている左サイドパネル（閉じていれば null）
export const leftSidePanelIn = LEFT_SIDE_PANEL.read

// 外観枠の状態 frame の左サイドパネルを open にした形にする（null なら閉じる）
export const withLeftSidePanel = LEFT_SIDE_PANEL.write

// 今開いている物 now に、開く側のタブの組 entries（開きたいタブ tab。無ければ今開いているタブが組にあればそのまま、無ければ最初）で開くボタンを押したあとの左サイドパネル。
// 今と同じ組なら閉じる（null）、違えばその組に置き換える
export function pressedLeftSidePanel(
  now: LeftSidePanelOpen | null,
  entries: readonly LeftSidePanelEntry[],
  tab?: string,
): LeftSidePanelOpen | null {
  if (now && !tab && sameData(now.entries, entries)) return null
  return openedLeftSidePanel(now, entries, tab)
}

// 今開いている物 now を、開く側のタブの組 entries に置き換えた左サイドパネル（開くタブは tab、無ければ今のタブが組にあればそのまま、無ければ最初。組が空なら null）
export function openedLeftSidePanel(
  now: LeftSidePanelOpen | null,
  entries: readonly LeftSidePanelEntry[],
  tab?: string,
): LeftSidePanelOpen | null {
  const first = entries[0]
  if (!first) return null
  const has = (id: string | undefined) => entries.some(e => e.tab === id)
  return { entries, tab: tab && has(tab) ? tab : has(now?.tab) ? (now?.tab ?? first.tab) : first.tab }
}
