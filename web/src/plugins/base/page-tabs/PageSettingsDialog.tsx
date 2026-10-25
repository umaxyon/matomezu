// ページの設定のダイアログ: 開いているページの、ブックのタイプが選んだページの設定の項目（値が無ければブックの値を継ぐ）。
// 見出しの行の右にキャンセルと確定のボタン。確定でアクション page.update（設定の項目は settings）を書く
import { useId } from "react"
import { pagedOf } from "../../../core/book"
import { useT } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useSettingControls } from "../book-look/SettingControls"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, Form } from "../dialog-host/FormParts"

export function PageSettingsDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useT()
  const form = useId()
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? pagedOf(s.books[o.book]) : undefined
  })
  const page = book?.pages.find(p => p.id === args.page)
  const settings = useSettingControls(book, "page", page ?? null)
  const { perform } = useActions()
  if (!book || !page) return null
  const submit = () => {
    const done = perform("page.update", { page: page.id, settings: settings.patch }, { book: book.id })
    if (done.ok) onClose()
  }
  return (
    <Dialog
      title={t("Page settings")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready onSubmit={submit}>
        {settings.controls}
      </Form>
    </Dialog>
  )
}
