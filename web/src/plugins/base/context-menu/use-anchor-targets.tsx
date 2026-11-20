// 付ける先を持つプラグイン状態（anchor-targets.ts）を読み書きするフック
import { useCallback } from "react"
import type { PluginStateDef } from "../../../core/def/plugin-state"
import { usePluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { kit } from "../kit"
import type { AnchorTargets } from "./anchor-targets"

type Targets = PluginStateDef<AnchorTargets> & { scope: "stage" }

// 描いている場所のステージの付ける先（無ければ null）
export const useAnchorTargets = (state: Targets): AnchorTargets | null => usePluginState(kit, state) ?? null

// 描いている場所のステージの付ける先を置く（null なら終える）関数
export function useSetAnchorTargets(state: Targets): (targets: AnchorTargets | null) => void {
  const set = useSetPluginState(kit, state)
  return useCallback(targets => set(targets ?? undefined), [set])
}
