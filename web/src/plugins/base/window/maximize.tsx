// コントロールセンターの枠を退かせる（左の列などを画面の外へ出し、画面いっぱいを使う）ことの、中身と枠の受け渡し。
// 中身（タスクボードなど。枠を読めない別のプラグイン）は、画面いっぱいを使っている間 useControlCenterMaximize(true) で名乗り、枠は useControlCenterMaximized() で読む。
// 名乗った物が消えれば（外れた・プラグインを外した）、自然に解ける。名乗りの持ち方は maximize-state.ts
import { useEffect, useId } from "react"
import { usePluginState, useUpdatePluginState } from "../../../ui/plugin-state-hooks"
import { kit } from "../kit"
import { MAXIMIZERS } from "./maximize-state"

// 画面いっぱいを使っている間 active を true にする（枠が退く）
export function useControlCenterMaximize(active: boolean): void {
  const id = useId()
  const update = useUpdatePluginState(kit, MAXIMIZERS)
  useEffect(() => {
    if (!active) return
    update(now => [...(now ?? []).filter(x => x !== id), id])
    return () => update(now => (now ?? []).filter(x => x !== id))
  }, [active, id, update])
}

// 画面いっぱいを使っている物があるか（枠が退くか）
export const useControlCenterMaximized = (): boolean => (usePluginState(kit, MAXIMIZERS)?.length ?? 0) > 0
