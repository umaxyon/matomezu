// ダイアログの置き場: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で描く
import { fail } from "../../core/errors"
import { useActions, useApp, useUi } from "../store-context"

export function DialogHost() {
  const dialog = useApp(s => s.dialog)
  const { closeDialog } = useActions()
  const ui = useUi()
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  return <View key={`${dialog.id}:${dialog.stage}`} stage={dialog.stage} onClose={closeDialog} />
}
