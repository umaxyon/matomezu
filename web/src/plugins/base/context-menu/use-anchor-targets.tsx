// 付ける先を持つプラグイン状態（anchor-targets.ts）を読み書きするフック
import { useCallback } from "react"
import { NO_STATE, type PluginStateDef } from "../../../core/def/plugin-state"
import { usePluginState, useResetPluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { kit } from "../kit"
import type { AnchorTargets } from "./anchor-targets"

type Targets = PluginStateDef<AnchorTargets> & { scope: "stage" }

// 描いている場所のステージの付ける先（無ければ null）
export function useAnchorTargets(state: Targets): AnchorTargets | null {
  const targets = usePluginState(kit, state)
  return targets === NO_STATE ? null : targets
}

// 描いている場所のステージの付ける先を置く（null なら終える）関数
export function useSetAnchorTargets(state: Targets): (targets: AnchorTargets | null) => void {
  const set = useSetPluginState(kit, state)
  const reset = useResetPluginState(kit, state)
  return useCallback(targets => (targets === null ? reset() : set(targets)), [set, reset])
}
