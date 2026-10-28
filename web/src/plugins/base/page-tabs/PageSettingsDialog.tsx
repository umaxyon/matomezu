// ページの設定のダイアログ: 開いているページの名前と、ブックのタイプが選んだページの設定の項目（値が無ければブックの値を継ぐ）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。変えた項目は、選んだそばからページに重ねて見せる（ダイアログの下書き。名前は見せない）。
// 確定でアクション page-update（設定の項目は settings）を書き、キャンセルでは元のまま。選んでいる値でページに問題が出れば、その知らせを出して確定できない
import { useEffect, useId, useState } from "react"
import { pagedOf, putPage, withSettings } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { useSettingControls } from "../book-look/SettingControls"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { PageProblemsView, usePageProblems } from "./PageProblems"
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
  const { perform, previewDialog } = useActions()
  const bookId = book?.id
  const pageId = page?.id
  const changed = Object.keys(settings.patch).length > 0
  const problems = usePageProblems(
    book && page ? putPage(book, withSettings(page, settings.patch)) : undefined,
    pageId ? [pageId] : [],
  )
  useEffect(() => {
    previewDialog(changed && bookId && pageId ? { book: bookId, page: pageId, props: settings.patch } : null)
  }, [changed, bookId, pageId, settings.patch, previewDialog])
  if (!book || !page) return null
  const ready = title.trim() !== "" && problems.length === 0
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
          <ActionButton form={form} primary disabled={!ready}>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={ready} onSubmit={submit}>
        <Field label={t("Page name")}>
          {fid => <input id={fid} className={controlClass} value={title} onChange={e => setTitle(e.target.value)} />}
        </Field>
        {settings.controls}
        <PageProblemsView problems={problems} />
      </Form>
    </Dialog>
  )
}
