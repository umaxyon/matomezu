// ダイアログの置き場（ウィジェット dialog-host）: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で、開くときに渡された値と一緒に描く。
// 中のビューの描いている場所は、開いた場所（ステージか、ステージを持たないスクリーン。ui/scope.tsx）。
// ダイアログの定義が edits を持てば、開いている間、その物に編集ロックを掛ける（ページの id ならそのページ、バインダの id なら開いたステージのブックの中のバインダか、開いているブックの外のバインダ、ほかは開いたステージで開いているページの中の物）

import { fail } from "../../../core/errors"
import { outsideBinderIn } from "../../../core/folders-tree"
import { openedBook, shownPageId } from "../../../core/stage"
import { stageIn } from "../../../core/window"
import { openedAt } from "../../../store/dialogs"
import { ActsOnScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { NO_LINEUP, openedLineup } from "../page-tabs/opened-lineup"
import { useEditLock } from "../utils/useEditLock"
import { locksOf } from "./locks"

export function DialogHost() {
  const dialog = useMatomezuState(s => s.dialog)
  const opened = useMatomezuState(s => (s.dialog ? stageIn(s.window, s.dialog.stage)?.opened : undefined) ?? null)
  const book = useMatomezuState(s => openedBook(s.books, opened))
  const binder = useMatomezuState(s => (opened && outsideBinderIn(s, opened.outermost.id)) ?? null)
  const { closeDialog } = useStoreActions()
  const ui = useUiCatalog()
  const dialogs = useCatalog().store.dialogs
  const def = dialog ? dialogs.get(dialog.id) : undefined
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  const lineup = openedLineup(book ?? null, binder)
  const locks = locksOf(lineup === NO_LINEUP ? null : lineup, shownPageId(opened), def?.edits?.(dialog.args) ?? [])
  return (
    <ActsOnScope at={openedAt(dialog)}>
      {locks.map(l => (
        <Lock key={l.within} within={l.within} ids={l.ids} />
      ))}
      <View key={`${dialog.id}:${dialog.stage}`} args={dialog.args as never} onClose={closeDialog} />
    </ActsOnScope>
  )
}

function Lock({ within, ids }: { within: string; ids: readonly string[] }) {
  useEditLock(within, ids)
  return null
}
