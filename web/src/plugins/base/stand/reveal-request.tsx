// 物を見せてという頼み: base のプラグイン状態 revealing に、見せたい物の id を置く。ステージのアンカーの表（anchors.tsx）が、
// 物が描かれたら倍率そのままで真ん中へ見せて、頼みを消す（ほかのページを開いてから見せるときに、描かれるのを待つため）。
// 頼む側は、見せたいステージを名指す（郵便箱の画面が、行き先を開いたステージに頼むなど）

import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { NO_STAGE } from "../../../core/stage"
import { pluginValueOf } from "../../../store/plugin-state"
import { useResetPluginStateAt, useSetPluginStateAt } from "../../../ui/at-hooks"
import { useStageId } from "../../../ui/scope"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { REVEALING_STATE } from "./reveal-state"

// ステージ stage で見せてと頼まれている物（無ければ null）
export const useRevealRequest = (stage: string): readonly string[] | null =>
  useMatomezuState(useShallow(s => pluginValueOf(s.pluginValues, stage, REVEALING_STATE) ?? null))

// ステージ stage で、物 ids を見せてと頼む関数
export function useRequestReveal(): (stage: string, ids: readonly string[]) => void {
  return useSetPluginStateAt(kit, REVEALING_STATE)
}

// ステージ stage の、見せてという頼みを消す関数
export function useClearRevealRequest(): (stage: string) => void {
  const reset = useResetPluginStateAt(kit, REVEALING_STATE)
  return useCallback((stage: string) => reset(stage), [reset])
}

// 描いている場所のステージで、物 ids を見せてと頼む関数（描いている場所がステージでなければ、何もしない）
export function useRevealHere(): (ids: readonly string[]) => void {
  const stage = useStageId()
  const reveal = useRequestReveal()
  return useCallback(
    ids => {
      if (stage !== NO_STAGE) reveal(stage, ids)
    },
    [stage, reveal],
  )
}
