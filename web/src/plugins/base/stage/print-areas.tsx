// 印刷区画の区切りの線を隠しているか（base が持つステージのプラグイン状態。画面の中だけで、読み直すと見せる）
import { usePluginState, useReadPluginState, useSetPluginState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { PRINT_AREAS_HIDDEN } from "./states"

// 描いている場所のステージで、区切りの線を隠しているか
export const usePrintAreasHidden = (): boolean => usePluginState(kit, PRINT_AREAS_HIDDEN) ?? false

// 描いている場所のステージの区切りの線を、見せる・隠すを入れ替える関数
export function useTogglePrintAreas(): () => void {
  const read = useReadPluginState(kit, PRINT_AREAS_HIDDEN)
  const set = useSetPluginState(kit, PRINT_AREAS_HIDDEN)
  return () => set(read() ? undefined : true)
}
