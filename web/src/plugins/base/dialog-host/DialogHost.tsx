// ダイアログの置き場（ウィジェット dialog-host）: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で、開くときに渡された値と一緒に描く。
// 中のビューの描いている場所は、開いた場所（ステージか、ステージを持たないスクリーン。ui/scope.tsx）。
// ダイアログの定義が edits を持てば、開いている間、開いたステージのブックのその物に編集ロックを掛ける

import { fail } from "../../../core/errors"
import { stageIn } from "../../../core/window"
import { ActsOnScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { useEditLock } from "../utils/useEditLock"

export function DialogHost() {
  const dialog = useMatomezuState(s => s.dialog)
  const book = useMatomezuState(s => (s.dialog ? stageIn(s.window, s.dialog.stage)?.opened?.book : undefined) ?? null)
  const { closeDialog } = useStoreActions()
  const ui = useUiCatalog()
  const dialogs = useCatalog().store.dialogs
  const def = dialog ? dialogs.get(dialog.id) : undefined
  useEditLock(book, (dialog && def?.edits?.(dialog.args)) ?? NONE)
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  return (
    <ActsOnScope at={dialog.stage}>
      <View key={`${dialog.id}:${dialog.stage}`} args={dialog.args as never} onClose={closeDialog} />
    </ActsOnScope>
  )
}

const NONE: readonly string[] = []
