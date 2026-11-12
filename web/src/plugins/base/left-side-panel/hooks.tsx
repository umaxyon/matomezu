// 左サイドパネルを開け閉めするフック（持ち方は state.ts。窓のプラグイン状態）。窓に 1 つ。
// 開くのは、開く側が渡したタブの組（どのタブに何を渡すか）で置き換える。前に出している物（ブックスクリーン・コントロールセンター）は替えない
import { useCallback } from "react"
import { usePluginState, useSetPluginState, useUpdatePluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import {
  LEFT_SIDE_PANEL_STATE,
  type LeftSidePanelEntry,
  type LeftSidePanelOpen,
  openedLeftSidePanel,
  pressedLeftSidePanel,
} from "./state"

// 開いている左サイドパネル（渡されたタブの組と開いているタブ。閉じていれば null）
export const useLeftSidePanel = (): LeftSidePanelOpen | null => usePluginState(kit, LEFT_SIDE_PANEL_STATE) ?? null

// タブの組 entries で左サイドパネルを開く関数（開くタブは tab。無ければ今のタブが組にあればそのまま、無ければ最初）
export function useOpenLeftSidePanel(): (entries: readonly LeftSidePanelEntry[], tab?: string) => void {
  const update = useUpdatePluginState(kit, LEFT_SIDE_PANEL_STATE)
  return useCallback((entries, tab) => update(now => openedLeftSidePanel(now, entries, tab)), [update])
}

// 開くボタンを押したときの関数: 今と同じタブの組なら閉じ、違えばそのタブの組に置き換える
export function useToggleLeftSidePanel(): (entries: readonly LeftSidePanelEntry[]) => void {
  const update = useUpdatePluginState(kit, LEFT_SIDE_PANEL_STATE)
  return useCallback(entries => update(now => pressedLeftSidePanel(now, entries)), [update])
}

// 左サイドパネルを閉じる関数
export function useCloseLeftSidePanel(): () => void {
  const set = useSetPluginState(kit, LEFT_SIDE_PANEL_STATE)
  return useCallback(() => set(undefined), [set])
}

// 開いているタブを tab にする関数（渡されたタブの組の中のタブだけ）
export function useSetLeftSidePanelTab(): (tab: string) => void {
  const update = useUpdatePluginState(kit, LEFT_SIDE_PANEL_STATE)
  return useCallback(tab => update(now => (now?.entries.some(e => e.tab === tab) ? { ...now, tab } : now)), [update])
}
