// ステージの外（しおり・郵便箱など）からダイアログを開く: いちばん最近カレントにしたブックスクリーンのカレントのステージで、
// ブックスクリーンが無ければカレントスクリーンから、ステージを持たずに開く（カレントスクリーンは替えない）
import { useCallback } from "react"
import type { DialogId } from "../../../core/catalog"
import { currentScreen, recentBookScreen } from "../../../core/window"
import type { DialogArgs } from "../../../store/dialogs"
import { useReadState, useStoreActions } from "../../../ui/store-context"

export function useOpenDialogInRecentStage(): <Id extends DialogId>(id: Id, ...args: DialogArgs<Id>) => void {
  const { openDialog } = useStoreActions()
  const read = useReadState()
  return useCallback(
    <Id extends DialogId>(id: Id, ...args: DialogArgs<Id>) => {
      const win = read().window
      openDialog(recentBookScreen(win)?.stages.current ?? currentScreen(win).id, id, ...args)
    },
    [openDialog, read],
  )
}
