// ブックの設定のダイアログ: ブックの名前と、ブックのタイプが選んだブックの設定の項目（テーマ・紙の色・線の既定の通り方など。項目のビューを並べる）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。変えた項目は、選んだそばからブックに重ねて見せる（ダイアログの下書き。名前は見せない）。
// 確定でアクション book-update（設定の項目は settings）を書き、キャンセルでは元のまま
import { useEffect, useId, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { BOOK_UPDATE } from "."
import { useSettingControls } from "./SettingControls"

export function BookSettingsDialog({ stage, onClose }: DialogProps) {
  const t = useMessages(kit)
  const form = useId()
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const { perform, previewDialog } = useActions()
  const [title, setTitle] = useState(book?.title ?? "")
  const settings = useSettingControls(book, "book", null)
  const id = book?.id
  const changed = Object.keys(settings.patch).length > 0
  useEffect(() => {
    previewDialog(changed && id ? { book: id, props: settings.patch } : null)
  }, [changed, id, settings.patch, previewDialog])
  if (!book) return null
  const named = title.trim() !== ""
  const submit = () => {
    const done = perform(BOOK_UPDATE.id, { title, ...(changed ? { settings: settings.patch } : {}) }, { book: book.id })
    if (done.ok) onClose()
  }
  return (
    <Dialog
      title={t("Book settings")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!named}>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={named} onSubmit={submit}>
        <Field label={t("Book name")}>
          {fid => <input id={fid} className={controlClass} value={title} onChange={e => setTitle(e.target.value)} />}
        </Field>
        {settings.controls}
      </Form>
    </Dialog>
  )
}
