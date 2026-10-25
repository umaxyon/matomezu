// ダイアログの置き場（ウィジェット dialog-host）: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で、開くときに渡された値と一緒に描く
import { fail } from "../../../core/errors"
import { useActions, useMatomezuState, useUiCatalog } from "../../../ui/store-context"

export function DialogHost() {
  const dialog = useMatomezuState(s => s.dialog)
  const { closeDialog } = useActions()
  const ui = useUiCatalog()
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  return (
    <View key={`${dialog.id}:${dialog.stage}`} stage={dialog.stage} args={dialog.args as never} onClose={closeDialog} />
  )
}
