// 郵便の行き先の物: 郵便のダイアログから行き先を開いたら、base のステージのプラグイン状態 mail-bird-visit（states.ts）に、その郵便と行き先を置く。
// 行き先の物のレイヤー（MailLayer）が、行き先の物の枠を光らせ、鳥を連れてきて、鳥が飛び去ったら消す。ステージが行き先から離れても消す
import { useCallback } from "react"
import { useSetPluginStateAt } from "../../../ui/at-hooks"
import { usePluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { type BirdVisit, MAIL_BIRD_VISIT } from "./states"

export type { BirdVisit }

// 描いている場所のステージで、鳥を連れてきている郵便の行き先の物（無ければ null）
export const useBirdVisit = (): BirdVisit | null => usePluginState(kit, MAIL_BIRD_VISIT) ?? null

// ステージ stage で、郵便の行き先の物を置く（null で消す）関数（郵便のダイアログが、行き先を開いたステージを名指して置く）
export function useSetBirdVisit(): (stage: string, visit: BirdVisit | null) => void {
  const set = useSetPluginStateAt(kit, MAIL_BIRD_VISIT)
  return useCallback((stage, visit) => set(stage, visit ?? undefined), [set])
}
