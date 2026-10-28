// ページの設定のダイアログ: 開いているページの名前と、ブックのタイプが選んだページの設定の項目（値が無ければブックの値を継ぐ）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。変えた項目は、選んだそばからページに重ねて見せる（ダイアログの下書き。名前は見せない）。
// 確定でアクション page-update（設定の項目は settings）を書き、キャンセルでは元のまま。選んでいる値でページに問題が出れば、その知らせを出して確定できない
// ページを削除するボタンは、上に重ねたモーダルで確かめてから page-remove を行う（中身ごと消え、戻せないため）
import { useEffect, useId, useState } from "react"
import { pagedOf, putPage, withSettings } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { usePerform } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form, rowClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { PageProblemsView, usePageProblems } from "../utils/PageProblems"
import { useSettingControls } from "../utils/SettingControls"
import { PAGE_REMOVE } from "./page-remove"
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
  const [confirming, setConfirming] = useState(false)
  const settings = useSettingControls(book, "page", page ?? null)
  const { previewDialog } = useActions()
  const perform = usePerform(stage)
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
    const done = perform(PAGE_UPDATE.id, { page: page.id, title, settings: settings.patch })
    if (done.ok) onClose()
  }
  const remove = () => {
    perform(PAGE_REMOVE.id, { page: page.id })
    onClose()
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
        <div className={rowClass}>
          <ActionButton danger onClick={() => setConfirming(true)}>
            {t("Delete page")}
          </ActionButton>
        </div>
        {confirming && (
          <Confirm
            message={t("The page and its contents will be deleted")}
            ok={t("Delete")}
            cancel={t("Cancel")}
            onOk={remove}
            onCancel={() => setConfirming(false)}
          />
        )}
      </Form>
    </Dialog>
  )
}
