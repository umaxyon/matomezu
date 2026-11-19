// ダイアログの置き場（ウィジェット dialog-host）: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で、開くときに渡された値と一緒に描く。
// 中のビューの描いている場所は、開いた場所（ステージか、ステージを持たないスクリーン。ui/scope.tsx）。
// ダイアログの定義が edits を持てば、開いている間、その物に編集ロックを掛ける（ページの id ならそのページ、バインダの id なら開いたステージのブックの中のバインダ、ほかは開いたステージで開いているページの中の物）

import { findBinder, findPage } from "../../../core/book"
import { fail } from "../../../core/errors"
import type { Book } from "../../../core/schema/book"
import { shownPageId } from "../../../core/stage"
import { stageIn } from "../../../core/window"
import { openedAt } from "../../../store/dialogs"
import { ActsOnScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { useEditLock } from "../utils/useEditLock"

export function DialogHost() {
  const dialog = useMatomezuState(s => s.dialog)
  const opened = useMatomezuState(s => (s.dialog ? stageIn(s.window, s.dialog.stage)?.opened : undefined) ?? null)
  const book = useMatomezuState(s => (opened ? s.books[opened.book] : undefined))
  const { closeDialog } = useStoreActions()
  const ui = useUiCatalog()
  const dialogs = useCatalog().store.dialogs
  const def = dialog ? dialogs.get(dialog.id) : undefined
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  const locks = book ? locksOf(book, shownPageId(opened), def?.edits?.(dialog.args) ?? []) : []
  return (
    <ActsOnScope at={openedAt(dialog)}>
      {locks.map(l => (
        <Lock key={l.within} within={l.within} ids={l.ids} />
      ))}
      <View key={`${dialog.id}:${dialog.stage}`} args={dialog.args as never} onClose={closeDialog} />
    </ActsOnScope>
  )
}

// 直している物 ids を、編集ロックを掛ける所（ページかブック）ごとにまとめる: ページの id はそのページ、バインダの id はブック、ほかは開いているページ shown の中の物
function locksOf(book: Book, shown: string | null, ids: readonly string[]): { within: string; ids: string[] }[] {
  const locks = new Map<string, string[]>()
  for (const id of ids) {
    const within = findPage(book, id) ? id : findBinder(book, id) ? book.id : shown
    if (within !== null) locks.set(within, [...(locks.get(within) ?? []), id])
  }
  return [...locks].map(([within, ids]) => ({ within, ids }))
}

function Lock({ within, ids }: { within: string; ids: readonly string[] }) {
  useEditLock(within, ids)
  return null
}

// ダイアログの操作の向け先: 開いたステージ。ステージを持たずに開いたなら、開いたスクリーン
