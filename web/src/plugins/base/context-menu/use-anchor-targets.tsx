// 付ける先を持つプラグイン状態（anchor-targets.ts）を読み書きするフック
import { useCallback } from "react"
import type { PluginStateDef } from "../../../core/def/plugin-state"
import { usePluginState, useSetPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { AnchorTargets } from "./anchor-targets"

type Targets = PluginStateDef<AnchorTargets> & { scope: "stage" }

// そのステージの付ける先（無ければ null）
export const useAnchorTargets = (stage: string, state: Targets): AnchorTargets | null =>
  usePluginState(kit, state, stage) ?? null

// ステージの付ける先を置く（null なら終える）関数
export function useSetAnchorTargets(state: Targets): (stage: string, targets: AnchorTargets | null) => void {
  const set = useSetPluginState(kit, state)
  return useCallback((stage, targets) => set(stage, targets ?? undefined), [set])
}
