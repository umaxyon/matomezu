// 付ける先を持つ画面の状態（anchor-targets.ts）を読み書きするフック
import { useCallback } from "react"
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { AnchorTargetState, AnchorTargets } from "./anchor-targets"

// そのステージの付ける先（無ければ null）
export const useAnchorTargets = (stage: string, state: AnchorTargetState): AnchorTargets | null =>
  state.read(useStageState(stage, kit))

// ステージの付ける先を置く（null なら終える）関数
export function useSetAnchorTargets(state: AnchorTargetState): (stage: string, targets: AnchorTargets | null) => void {
  const read = useReadStageState(kit)
  const set = useSetStageState(kit)
  return useCallback((stage, targets) => set(stage, state.write(read(stage), targets)), [read, set, state])
}
