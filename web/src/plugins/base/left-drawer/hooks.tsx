// 左ドロワーを開け閉めするフック（持ち方は state.ts）。開くのは、ステージに置いてそのステージをカレントにするだけ
import { useCallback } from "react"
import { useActions, useLayout, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { LEFT_DRAWER } from "./slots"
import { leftDrawerIn, withLeftDrawer } from "./state"

// ステージ stage で開いている左ドロワーのタブ（閉じていれば null）
export const useLeftDrawer = (stage: string): string | null =>
  useMatomezuState(s => leftDrawerIn(s.stageStates[stage]?.[kit.id]))

// 配置が左ドロワーのスロットに置いたウィジェット（タブの並び）
export const useLeftDrawerTabs = (): readonly string[] => useLayout().slots[LEFT_DRAWER] ?? []

// ステージ stage の左ドロワーで、タブ tab を開く関数（null なら閉じる）
export function useSetLeftDrawer(): (stage: string, tab: string | null) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { focusStage } = useActions()
  return useCallback(
    (stage, tab) => {
      set(stage, withLeftDrawer(read().stageStates[stage]?.[kit.id], tab))
      if (tab) focusStage(stage)
    },
    [read, set, focusStage],
  )
}

// ステージ stage の左ドロワーで、タブ tab（左ドロワーのスロットに置いたウィジェットの id）を開く関数
export const useOpenLeftDrawer = (): ((stage: string, tab: string) => void) => useSetLeftDrawer()

// ステージ stage の左ドロワーを閉じる関数
export function useCloseLeftDrawer(): (stage: string) => void {
  const set = useSetLeftDrawer()
  return useCallback((stage: string) => set(stage, null), [set])
}
