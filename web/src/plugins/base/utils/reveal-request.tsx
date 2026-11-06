// 物を見せてという頼み: base のステージの画面の状態の revealing に、見せたい物の id を置く。ステージのアンカーの表（anchors.tsx）が、
// 物が描かれたら倍率そのままで真ん中へ見せて、頼みを消す（ほかのページを開いてから見せるときに、描かれるのを待つため）
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { nullableItem } from "./stage-item"

const REVEALING = nullableItem<readonly string[]>("revealing")
const revealingIn = REVEALING.read
const withRevealing = REVEALING.write

// ステージ stage で見せてと頼まれている物（無ければ null）
export const useRevealRequest = (stage: string): readonly string[] | null =>
  useMatomezuState(useShallow(s => revealingIn(s.stageStates[stage]?.[kit.id])))

// ステージ stage で、物 ids を見せてと頼む関数
export function useRequestReveal(): (stage: string, ids: readonly string[]) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback((stage, ids) => set(stage, withRevealing(read().stageStates[stage]?.[kit.id], ids)), [read, set])
}

// ステージ stage の、見せてという頼みを消す関数
export function useClearRevealRequest(): (stage: string) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    (stage: string) => set(stage, withRevealing(read().stageStates[stage]?.[kit.id], null)),
    [read, set],
  )
}
