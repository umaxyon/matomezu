// 左サイドパネルを開け閉めするフック（持ち方は state.ts。窓のプラグイン状態）。窓に 1 つ。
// 開くのは、開く側が渡したタブの組（どのタブに何を渡すか）で置き換える。前に出している物（ブックスクリーン・コントロールセンター）は替えない。
// ステージの物を見せるタブ（タブの定義の scope が "stage"）が組にあれば、開いた所のステージを一緒に持つ（タブの中身は、そのステージの中として描かれる）
import { useCallback } from "react"
import { useStageId } from "../../../ui/scope"
import { usePluginState, useSetPluginState, useUiCatalog, useUpdatePluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import {
  LEFT_SIDE_PANEL_STATE,
  type LeftSidePanelEntry,
  type LeftSidePanelOpen,
  openedLeftSidePanel,
  pressedLeftSidePanel,
  showsLeftSidePanel,
} from "./state"

// 開いている左サイドパネル（渡されたタブの組と開いているタブ。閉じていれば null）
export const useLeftSidePanel = (): LeftSidePanelOpen | null => usePluginState(kit, LEFT_SIDE_PANEL_STATE) ?? null

// タブの組 entries が見せるステージを決める関数: ステージの物を見せるタブが組にあれば stage、無ければ null
function useShownStage(): (entries: readonly LeftSidePanelEntry[], stage: string | null) => string | null {
  const widgets = useUiCatalog().widgets
  return useCallback(
    (entries, stage) => (entries.some(e => widgets.get(e.tab)?.leftSidePanel?.scope === "stage") ? stage : null),
    [widgets],
  )
}

// ステージ stage の物を見せて、タブの組 entries で左サイドパネルを開く関数（開くタブは tab。無ければ今のタブが組にあればそのまま、無ければ最初）
export function useOpenLeftSidePanelAt(): (
  stage: string | null,
  entries: readonly LeftSidePanelEntry[],
  tab?: string,
) => void {
  const update = useUpdatePluginState(kit, LEFT_SIDE_PANEL_STATE)
  const shown = useShownStage()
  return useCallback(
    (stage, entries, tab) => update(now => openedLeftSidePanel(now, entries, shown(entries, stage), tab)),
    [update, shown],
  )
}

// 開くボタンを押したときの関数（ステージ stage の物を見せる）: 今と同じタブの組で同じステージなら閉じ、違えばそのタブの組に置き換える
export function useToggleLeftSidePanelAt(): (stage: string | null, entries: readonly LeftSidePanelEntry[]) => void {
  const update = useUpdatePluginState(kit, LEFT_SIDE_PANEL_STATE)
  const shown = useShownStage()
  return useCallback(
    (stage, entries) => update(now => pressedLeftSidePanel(now, entries, shown(entries, stage))),
    [update, shown],
  )
}

// 今、タブの組 entries を、ステージ stage の物を見せて開いているか
export function useLeftSidePanelShowsAt(stage: string | null, entries: readonly LeftSidePanelEntry[]): boolean {
  const now = usePluginState(kit, LEFT_SIDE_PANEL_STATE)
  return showsLeftSidePanel(now, entries, useShownStage()(entries, stage))
}

// タブの組 entries で左サイドパネルを開く関数（開くタブは tab。無ければ今のタブが組にあればそのまま、無ければ最初）。ステージの物を見せるタブは、描いている場所のステージの物を見せる
export function useOpenLeftSidePanel(): (entries: readonly LeftSidePanelEntry[], tab?: string) => void {
  const stage = useStageId()
  const open = useOpenLeftSidePanelAt()
  return useCallback((entries, tab) => open(stage, entries, tab), [open, stage])
}

// 開くボタンを押したときの関数: 今と同じタブの組（ステージの物を見せるタブがあれば、同じステージ）なら閉じ、違えばそのタブの組に置き換える
export function useToggleLeftSidePanel(): (entries: readonly LeftSidePanelEntry[]) => void {
  const stage = useStageId()
  const toggle = useToggleLeftSidePanelAt()
  return useCallback(entries => toggle(stage, entries), [toggle, stage])
}

// 今、タブの組 entries を開いているか（ステージの物を見せるタブがあれば、描いている場所のステージの物を見せているか）
export const useLeftSidePanelShows = (entries: readonly LeftSidePanelEntry[]): boolean =>
  useLeftSidePanelShowsAt(useStageId(), entries)

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
