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
// 持っている形: 開いている左サイドパネルに、ステージの物を見せるタブ（タブの定義の scope が "stage"）が見せるステージを足した物（そういうタブが組に無ければ null）
export interface LeftSidePanelHeld extends LeftSidePanelOpen {
  stage: string | null
}

export const LEFT_SIDE_PANEL_STATE = kit.definePluginStateOf<LeftSidePanelHeld>()({
  id: "left-side-panel",
  scope: "window",
})

export const LEFT_SIDE_PANEL_STATES = [LEFT_SIDE_PANEL_STATE] as const

// 今開いている物 now が、タブの組 entries を、ステージ stage の物を見せて開いているか
export const showsLeftSidePanel = (
  now: LeftSidePanelHeld | undefined | null,
  entries: readonly LeftSidePanelEntry[],
  stage: string | null,
): boolean => !!now && now.stage === stage && sameData(now.entries, entries)

// 今開いている物 now に、開く側のタブの組 entries（見せるステージ stage）で開くボタンを押したあとの左サイドパネル。
// 今と同じ組で同じステージなら閉じる（undefined）、違えばその組に置き換える
export function pressedLeftSidePanel(
  now: LeftSidePanelHeld | undefined,
  entries: readonly LeftSidePanelEntry[],
  stage: string | null,
): LeftSidePanelHeld | undefined {
  if (showsLeftSidePanel(now, entries, stage)) return undefined
  return openedLeftSidePanel(now, entries, stage)
}

// 今開いている物 now を、開く側のタブの組 entries（見せるステージ stage）に置き換えた左サイドパネル（開くタブは tab、無ければ今のタブが組にあればそのまま、無ければ最初。組が空なら undefined）
export function openedLeftSidePanel(
  now: LeftSidePanelHeld | undefined,
  entries: readonly LeftSidePanelEntry[],
  stage: string | null,
  tab?: string,
): LeftSidePanelHeld | undefined {
  const first = entries[0]
  if (!first) return undefined
  const has = (id: string | undefined) => entries.some(e => e.tab === id)
  return { entries, stage, tab: tab && has(tab) ? tab : has(now?.tab) ? (now?.tab ?? first.tab) : first.tab }
}
