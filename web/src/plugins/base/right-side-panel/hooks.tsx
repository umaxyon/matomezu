// 右サイドパネルを開け閉めするフック（持ち方は state.ts）。窓に 1 つだけなので、開くときはほかのステージの右サイドパネルを閉じ、開いたステージをカレントにする
import { useCallback } from "react"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { panelIn, type RightSidePanelOpen, withPanel } from "./state"

// 押したときに右サイドパネルを閉じたか（そのあとの click で、押した物がまた開かないように。次に押すと消える）
let pressClosed = false
if (typeof document !== "undefined") document.addEventListener("pointerdown", () => (pressClosed = false), true)
export const closedByThisPress = (): boolean => pressClosed
export const notePressClosed = (): void => {
  pressClosed = true
}

// 右サイドパネルを開いているステージの id（どこも開いていなければ null）
export const useRightSidePanelStage = (): string | null =>
  useMatomezuState(s => s.workspace.stages.find(st => panelIn(s.stageStates[st.id]?.[kit.id]) !== null)?.id ?? null)

// ステージ stage の右サイドパネル（開いていなければ null）
export const useRightSidePanel = (stage: string): RightSidePanelOpen | null => panelIn(useStageState(stage, kit))

// 右サイドパネルを開く関数: ステージ stage で、中身 panel に物 subject（付いた先は anchor）を見せる
export function useOpenRightSidePanel(): (
  stage: string,
  open: Pick<RightSidePanelOpen, "panel" | "subject" | "anchor">,
) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  const { focusStage } = useActions()
  return useCallback(
    (stage, open) => {
      const { workspace, stageStates } = read()
      const opened = workspace.stages.find(s => s.id === stage)?.opened
      if (!opened) return
      for (const s of workspace.stages)
        if (s.id !== stage && panelIn(stageStates[s.id]?.[kit.id]))
          set(s.id, withPanel(stageStates[s.id]?.[kit.id], null))
      set(stage, withPanel(stageStates[stage]?.[kit.id], { ...open, book: opened.book, page: opened.page }))
      focusStage(stage)
    },
    [read, set, focusStage],
  )
}

// ステージ stage の右サイドパネルを閉じる関数
export function useCloseRightSidePanel(): (stage: string) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    stage => {
      const now = read().stageStates[stage]?.[kit.id]
      if (panelIn(now)) set(stage, withPanel(now, null))
    },
    [read, set],
  )
}
