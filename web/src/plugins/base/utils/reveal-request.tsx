// 物を見せてという頼み: base のプラグイン状態 revealing に、見せたい物の id を置く。ステージのアンカーの表（anchors.tsx）が、
// 物が描かれたら倍率そのままで真ん中へ見せて、頼みを消す（ほかのページを開いてから見せるときに、描かれるのを待つため）
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { pluginValueOf } from "../../../store/plugin-state"
import { useMatomezuState } from "../../../ui/store-context"
import { useSetPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { REVEALING_STATE } from "./reveal-state"

// ステージ stage で見せてと頼まれている物（無ければ null）
export const useRevealRequest = (stage: string): readonly string[] | null =>
  useMatomezuState(useShallow(s => pluginValueOf(s.pluginValues, stage, REVEALING_STATE) ?? null))

// ステージ stage で、物 ids を見せてと頼む関数
export function useRequestReveal(): (stage: string, ids: readonly string[]) => void {
  return useSetPluginState(kit, REVEALING_STATE)
}

// ステージ stage の、見せてという頼みを消す関数
export function useClearRevealRequest(): (stage: string) => void {
  const set = useSetPluginState(kit, REVEALING_STATE)
  return useCallback((stage: string) => set(stage, undefined), [set])
}
