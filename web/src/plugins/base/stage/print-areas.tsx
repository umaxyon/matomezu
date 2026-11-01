// 印刷区画の区切りの線を隠しているか（base が持つステージの画面の状態。画面の中だけで、読み直すと見せる）
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"

const hiddenIn = (state: unknown): boolean =>
  (state as { printAreasHidden?: boolean } | undefined)?.printAreasHidden === true

// ステージ stage で、区切りの線を隠しているか
export const usePrintAreasHidden = (stage: string): boolean => hiddenIn(useStageState(stage, kit))

// ステージの区切りの線を、見せる・隠すを入れ替える関数
export function useTogglePrintAreas(): (stage: string) => void {
  const read = useReadStageState(kit)
  const set = useSetStageState(kit)
  return stage => {
    const state = (read(stage) ?? {}) as Record<string, unknown>
    set(stage, { ...state, printAreasHidden: !hiddenIn(state) })
  }
}
