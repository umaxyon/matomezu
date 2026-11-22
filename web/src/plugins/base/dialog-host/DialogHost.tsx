// ダイアログの置き場（ウィジェット dialog-host）: store の開いているダイアログ（dialog）を、その id の中身（プラグインが結んだビュー）で、開くときに渡された値と一緒に描く。
// 中のビューの描いている場所は、開いた場所（ステージか、ステージを持たないスクリーン。ui/scope.tsx）。
// ダイアログの定義が edits を持てば、開いている間、その物に編集ロックを掛ける（ページの id ならそのページ、バインダの id なら開いたステージのブックの中のバインダか、開いているブックの外のバインダ、ほかは開いたステージで開いているページの中の物）

import { fail } from "../../../core/errors"
import { outsideBinderIn } from "../../../core/folders-tree"
import type { StageLineup } from "../../../core/schema/book"
import { type Opened, openedBook, shownPageId } from "../../../core/stage"
import { stageIn } from "../../../core/window"
import { openedAt } from "../../../store/dialogs"
import type { MatomezuState } from "../../../store/state"
import { ActsOnScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState, useStoreActions, useUiCatalog } from "../../../ui/store-context"
import { useEditLock } from "../utils/useEditLock"
import { locksOf } from "./locks"

export function DialogHost() {
  const dialog = useMatomezuState(s => s.dialog)
  const { closeDialog } = useStoreActions()
  const ui = useUiCatalog()
  const dialogs = useCatalog().store.dialogs
  // 掛ける編集ロック（選び直しても同じ値になるよう、文字列で持つ）
  const locked = useMatomezuState(s => {
    const ids = s.dialog ? (dialogs.get(s.dialog.id)?.edits?.(s.dialog.args) ?? []) : []
    if (!s.dialog || ids.length === 0) return "[]"
    const opened = stageIn(s.window, s.dialog.stage)?.opened ?? null
    return JSON.stringify(locksOf(lineupOf(s, opened), shownPageId(opened), ids))
  })
  if (!dialog) return null
  const View = ui.dialogViews.get(dialog.id) ?? fail("E109", { kind: "dialog", id: dialog.id })
  const locks = JSON.parse(locked) as { within: string; ids: string[] }[]
  return (
    <ActsOnScope at={openedAt(dialog)}>
      {locks.map(l => (
        <Lock key={l.within} within={l.within} ids={l.ids} />
      ))}
      <View key={`${dialog.id}:${dialog.stage}`} args={dialog.args as never} onClose={closeDialog} />
    </ActsOnScope>
  )
}

// ステージで開いている物 opened の並び: 開いているブックか、開いているブックの外のバインダ（その id と、そのバインダ 1 つだけの並び）。どちらでもなければ null
function lineupOf(s: MatomezuState, opened: Opened | null): StageLineup | null {
  const book = openedBook(s.books, opened)
  if (book) return book
  const binder = opened?.outermost.kind === "binder" ? outsideBinderIn(s, opened.outermost.id) : undefined
  return binder ? { id: binder.id, lineup: [binder] } : null
}

function Lock({ within, ids }: { within: string; ids: readonly string[] }) {
  useEditLock(within, ids)
  return null
}
