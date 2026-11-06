// 郵便が指す物: 郵便のダイアログから行き先を開いたら、base のステージの画面の状態の pointing に、その郵便と行き先を置く。
// 指す物のレイヤー（MailPointing）が、指す物の枠を光らせ、鳥を連れてきて、鳥が飛び去ったら消す。ステージが行き先から離れても消す
import { useCallback } from "react"
import { useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"

export interface Pointing {
  mail: string // 指している郵便の id
  book: string
  page: string | null
  ids: readonly string[]
}

const pointingIn = (state: unknown): Pointing | null => (state as { pointing?: Pointing } | undefined)?.pointing ?? null

function withPointing(state: unknown, pointing: Pointing | null): Record<string, unknown> {
  const { pointing: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return pointing ? { ...rest, pointing } : rest
}

// ステージ stage で、郵便が指している物（無ければ null）
export const usePointing = (stage: string): Pointing | null =>
  useMatomezuState(s => pointingIn(s.stageStates[stage]?.[kit.id]))

// ステージ stage で、郵便が指す物を置く（null で消す）関数
export function useSetPointing(): (stage: string, pointing: Pointing | null) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    (stage, pointing) => set(stage, withPointing(read().stageStates[stage]?.[kit.id], pointing)),
    [read, set],
  )
}
