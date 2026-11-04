// 左ドロワーを開け閉めするフック（持ち方は state.ts）。開くのは、ステージに置いてそのステージをカレントにするだけ
import { useCallback } from "react"
import { useActions, useLayout, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { LEFT_DRAWER } from "./slots"
import { drawerIn, withDrawer } from "./state"

// ステージ stage で開いている左ドロワーのタブ（閉じていれば null）
export const useLeftDrawer = (stage: string): string | null =>
  useMatomezuState(s => drawerIn(s.stageStates[stage]?.[kit.id]))

// 配置が左ドロワーのスロットに置いたウィジェット（タブの並び）
export const useLeftDrawerTabs = (): readonly string[] => useLayout().slots[LEFT_DRAWER] ?? []

// ステージ stage の左ドロワーで、タブ tab を開く関数（null なら閉じる）
export function useSetLeftDrawer(): (stage: string, tab: string | null) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { focusStage } = useActions()
  return useCallback(
    (stage, tab) => {
      set(stage, withDrawer(read().stageStates[stage]?.[kit.id], tab))
      if (tab) focusStage(stage)
    },
    [read, set, focusStage],
  )
}
