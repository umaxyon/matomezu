// ダイアログの置き場: store の開いているダイアログ（dialog）を、その id の中身（DIALOG_VIEWS）で描く
import { useActions, useApp } from "../store-context"
import { DIALOG_VIEWS } from "./views"

export function DialogHost() {
  const dialog = useApp(s => s.dialog)
  const { closeDialog } = useActions()
  if (!dialog) return null
  const View = DIALOG_VIEWS[dialog.id]
  return <View key={`${dialog.id}:${dialog.stage}`} stage={dialog.stage} onClose={closeDialog} />
}
