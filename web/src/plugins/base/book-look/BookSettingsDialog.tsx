// ブックの設定のダイアログ: ブックの名前と、ブックのタイプが選んだブックの設定の項目（テーマ・紙の色・線の既定の通り方など。項目のビューを並べる）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。変えた項目は、選んだそばからブックに重ねて見せる（ダイアログの下書き。名前は見せない）。
// 確定でアクション book-update（設定の項目は settings）を書き、キャンセルでは元のまま。見出しの右の鍵でロックを切り替え、確定で book-lock・book-unlock を行う
// （外すのは書く前、掛けるのは書いた後）。選んでいる値で問題の出るページがあれば、その知らせを出して確定できない
import { useEffect, useId, useState } from "react"
import { withSettings } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { usePerform } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { BOOK_LOCK, BOOK_UNLOCK, changeWithLock } from "../lock"
import { LockToggle } from "../lock/LockToggle"
import { PageProblemsView, usePageProblems } from "../utils/PageProblems"
import { useSettingControls } from "../utils/SettingControls"
import { BOOK_UPDATE } from "."

export function BookSettingsDialog({ stage, onClose }: DialogProps) {
  const t = useMessages(kit)
  const form = useId()
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const { previewDialog } = useActions()
  const perform = usePerform(stage)
  const [title, setTitle] = useState(book?.title ?? "")
  const [locked, setLocked] = useState(book?.locked === true)
  const settings = useSettingControls(book, "book", null)
  const id = book?.id
  const changed = Object.keys(settings.patch).length > 0
  const problems = usePageProblems(book ? withSettings(book, settings.patch) : undefined)
  useEffect(() => {
    previewDialog(changed && id ? { book: id, props: settings.patch } : null)
  }, [changed, id, settings.patch, previewDialog])
  if (!book) return null
  const ready = title.trim() !== "" && problems.length === 0
  const submit = () => {
    const done = changeWithLock(
      book.locked === true,
      locked,
      () => perform(BOOK_LOCK.id, {}).ok,
      () => perform(BOOK_UNLOCK.id, {}).ok,
      () => perform(BOOK_UPDATE.id, { title, ...(changed ? { settings: settings.patch } : {}) }).ok,
    )
    if (done) onClose()
  }
  return (
    <Dialog
      title={t("Book settings")}
      aside={<LockToggle locked={locked} label={t(locked ? "Unlock book" : "Lock book")} onChange={setLocked} />}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!ready}>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={ready} onSubmit={submit}>
        <Field label={t("Book name")}>
          {fid => <input id={fid} className={controlClass} value={title} onChange={e => setTitle(e.target.value)} />}
        </Field>
        {settings.controls}
        <PageProblemsView problems={problems} />
      </Form>
    </Dialog>
  )
}
