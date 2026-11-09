// 左サイドパネルを開け閉めするフック（持ち方は state.ts。窓の外観枠の状態）。窓に 1 つ。
// 開くのは、開く側が渡したタブの組（どのタブに何を渡すか）で置き換える。前に出している物（ブックスクリーン・コントロールセンター）は替えない
import { useCallback } from "react"
import { useFrameState, useReadFrameState, useSetFrameState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import {
  type LeftSidePanelEntry,
  type LeftSidePanelOpen,
  leftSidePanelIn,
  openedLeftSidePanel,
  pressedLeftSidePanel,
  withLeftSidePanel,
} from "./state"

// 開いている左サイドパネル（渡されたタブの組と開いているタブ。閉じていれば null）
export const useLeftSidePanel = (): LeftSidePanelOpen | null => leftSidePanelIn(useFrameState(kit))

// タブの組 entries で左サイドパネルを開く関数（開くタブは tab。無ければ今のタブが組にあればそのまま、無ければ最初）
export function useOpenLeftSidePanel(): (entries: readonly LeftSidePanelEntry[], tab?: string) => void {
  const read = useReadFrameState(kit)
  const set = useSetFrameState(kit)
  return useCallback(
    (entries, tab) => set(withLeftSidePanel(read(), openedLeftSidePanel(leftSidePanelIn(read()), entries, tab))),
    [read, set],
  )
}

// 開くボタンを押したときの関数: 今と同じタブの組なら閉じ、違えばそのタブの組に置き換える
export function useToggleLeftSidePanel(): (entries: readonly LeftSidePanelEntry[]) => void {
  const read = useReadFrameState(kit)
  const set = useSetFrameState(kit)
  return useCallback(
    entries => set(withLeftSidePanel(read(), pressedLeftSidePanel(leftSidePanelIn(read()), entries))),
    [read, set],
  )
}

// 左サイドパネルを閉じる関数
export function useCloseLeftSidePanel(): () => void {
  const read = useReadFrameState(kit)
  const set = useSetFrameState(kit)
  return useCallback(() => set(withLeftSidePanel(read(), null)), [read, set])
}

// 開いているタブを tab にする関数（渡されたタブの組の中のタブだけ）
export function useSetLeftSidePanelTab(): (tab: string) => void {
  const read = useReadFrameState(kit)
  const set = useSetFrameState(kit)
  return useCallback(
    tab => {
      const now = leftSidePanelIn(read())
      if (now?.entries.some(e => e.tab === tab)) set(withLeftSidePanel(read(), { ...now, tab }))
    },
    [read, set],
  )
}
