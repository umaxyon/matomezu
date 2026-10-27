// ページの設定のダイアログ: 開いているページの名前と、ブックのタイプが選んだページの設定の項目（値が無ければブックの値を継ぐ）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。確定でアクション page-update（設定の項目は settings）を書く
import { useId, useState } from "react"
import { pagedOf } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useSettingControls } from "../book-look/SettingControls"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { PAGE_UPDATE } from "./page-update"

export function PageSettingsDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  const form = useId()
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? pagedOf(s.books[o.book]) : undefined
  })
  const page = book?.pages.find(p => p.id === args.page)
  const [title, setTitle] = useState(page?.title ?? "")
  const settings = useSettingControls(book, "page", page ?? null)
  const { perform } = useActions()
  if (!book || !page) return null
  const named = title.trim() !== ""
  const submit = () => {
    const done = perform(PAGE_UPDATE.id, { page: page.id, title, settings: settings.patch }, { book: book.id })
    if (done.ok) onClose()
  }
  return (
    <Dialog
      title={t("Page settings")}
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
        <Field label={t("Page name")}>
          {fid => <input id={fid} className={controlClass} value={title} onChange={e => setTitle(e.target.value)} />}
        </Field>
        {settings.controls}
      </Form>
    </Dialog>
  )
}
