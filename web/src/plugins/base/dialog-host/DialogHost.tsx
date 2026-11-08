// ダイアログの置き場（ウィジェット dialog-host）: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で、開くときに渡された値と一緒に描く。
// ダイアログの定義が edits を持てば、開いている間、開いたステージのブックのその物に編集ロックを掛ける

import { fail } from "../../../core/errors"
import { screenOf } from "../../../core/window"
import { useActions, useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { useEditLock } from "../utils/useEditLock"

export function DialogHost() {
  const dialog = useMatomezuState(s => s.dialog)
  const book = useMatomezuState(
    s => screenOf(s.window).stages.find(st => st.id === s.dialog?.stage)?.opened?.book ?? null,
  )
  const { closeDialog } = useActions()
  const ui = useUiCatalog()
  const dialogs = useCatalog().store.dialogs
  const def = dialog ? dialogs.get(dialog.id) : undefined
  useEditLock(book, (dialog && def?.edits?.(dialog.args)) ?? NONE)
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  return (
    <View key={`${dialog.id}:${dialog.stage}`} stage={dialog.stage} args={dialog.args as never} onClose={closeDialog} />
  )
}

const NONE: readonly string[] = []
