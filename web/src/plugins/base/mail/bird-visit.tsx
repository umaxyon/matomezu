// 郵便の行き先の物: 郵便のダイアログから行き先を開いたら、base のステージの画面の状態の mailBirdVisit に、その郵便と行き先を置く。
// 行き先の物のレイヤー（MailLayer）が、行き先の物の枠を光らせ、鳥を連れてきて、鳥が飛び去ったら消す。ステージが行き先から離れても消す
import { useCallback } from "react"
import { useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { nullableItem } from "../utils/stage-item"

export interface BirdVisit {
  mail: string // 行き先を開いた郵便の id
  seq: number // 開いた回ごとに増える番号（同じ郵便をもう一度開いたら、鳥を連れてき直す）
  book: string
  page: string | null
  ids: readonly string[]
}

const BIRD_VISIT = nullableItem<BirdVisit>("mailBirdVisit")
const birdVisitIn = BIRD_VISIT.read
const withBirdVisit = BIRD_VISIT.write

// ステージ stage で、鳥を連れてきている郵便の行き先の物（無ければ null）
export const useBirdVisit = (stage: string): BirdVisit | null =>
  useMatomezuState(s => birdVisitIn(s.stageStates[stage]?.[kit.id]))

// ステージ stage で、郵便の行き先の物を置く（null で消す）関数
export function useSetBirdVisit(): (stage: string, visit: BirdVisit | null) => void {
  const read = useReadState()
  const set = useSetStageState(kit)
  return useCallback(
    (stage, visit) => set(stage, withBirdVisit(read().stageStates[stage]?.[kit.id], visit)),
    [read, set],
  )
}
