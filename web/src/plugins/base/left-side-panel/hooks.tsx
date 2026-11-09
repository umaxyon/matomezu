// 左サイドパネルを開け閉めするフック（持ち方は state.ts）。窓に 1 つだけで、守るのは入れ物（LeftSidePanel）。
// 開くのは、ステージに置いてそのステージをカレントにし、ブックスクリーンを前に出す（ほかのステージで開いていた物は、入れ物が閉じる）
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { screenOf } from "../../../core/window"
import { useActions, useLayout, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { LEFT_SIDE_PANEL } from "./slots"
import { leftSidePanelIn, withLeftSidePanel } from "./state"

// ステージ stage で開いている左サイドパネルのタブ（閉じていれば null）
export const useLeftSidePanel = (stage: string): string | null =>
  useMatomezuState(s => leftSidePanelIn(s.stageStates[stage]?.[kit.id]))

// 左サイドパネルを開いているステージ（カレントのステージで開いていればそれ。どこも開いていなければ null）と、開いているタブ
export function useOpenedLeftSidePanel(): { stage: string; tab: string } | null {
  const stage = useMatomezuState(s => {
    const ids = screenOf(s.window)
      .stages.map(st => st.id)
      .filter(id => leftSidePanelIn(s.stageStates[id]?.[kit.id]))
    return ids.includes(screenOf(s.window).current) ? screenOf(s.window).current : (ids[0] ?? null)
  })
  const tab = useMatomezuState(s => (stage ? leftSidePanelIn(s.stageStates[stage]?.[kit.id]) : null))
  return stage && tab ? { stage, tab } : null
}

// 左サイドパネルを開いている、どのステージか（入れ物が、窓に 1 つを守るのに使う）
export const useStagesWithLeftSidePanel = (): readonly string[] =>
  useMatomezuState(
    useShallow(s =>
      screenOf(s.window)
        .stages.map(st => st.id)
        .filter(id => leftSidePanelIn(s.stageStates[id]?.[kit.id])),
    ),
  )

// UI マッピングが左サイドパネルのスロットに置いたウィジェット（タブの並び）
export const useLeftSidePanelTabs = (): readonly string[] => useLayout().slots[LEFT_SIDE_PANEL] ?? []

// ステージ stage の左サイドパネルで、タブ tab を開く関数（null なら閉じる）
export function useSetLeftSidePanel(): (stage: string, tab: string | null) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { focusStage, showBookScreen } = useActions()
  return useCallback(
    (stage, tab) => {
      set(stage, withLeftSidePanel(read().stageStates[stage]?.[kit.id], tab))
      if (tab) {
        focusStage(stage)
        showBookScreen()
      }
    },
    [read, set, focusStage, showBookScreen],
  )
}

// ステージ stage の左サイドパネルで、タブ tab（左サイドパネルのスロットに置いたウィジェットの id）を開く関数
export const useOpenLeftSidePanel = (): ((stage: string, tab: string) => void) => useSetLeftSidePanel()

// ステージ stage の左サイドパネルを閉じる関数
export function useCloseLeftSidePanel(): (stage: string) => void {
  const set = useSetLeftSidePanel()
  return useCallback((stage: string) => set(stage, null), [set])
}
