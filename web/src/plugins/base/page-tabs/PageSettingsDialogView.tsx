// ページの設定のダイアログのビュー: ページの名前と、紙・向き・可変ページか（PaperControls.tsx）と、ページのタイプが選んだページの設定の項目（値が無ければ定義の既定）。
// base のページの設定のダイアログと、タイプが自分で持つページの設定のダイアログ（ツリーなど）が使う。タイプは、足す入力Form（children）と、
// アクション page-update に足すフィールド（fields）と、書いている値を重ねたページ（draft。ページの問題を確かめるのに使う）を渡す。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。変えた設定の項目は、選んだそばからページに重ねて見せる（ダイアログの下書き。名前は見せない）。
// 確定でアクション page-update（設定の項目は settings）を書き、キャンセルでは元のまま。選んでいる値でページに問題が出れば、その知らせを出して確定できない。
// 見出しの右の鍵でロックを切り替え、確定で page-lock・page-unlock を行う（外すのは書く前、掛けるのは書いた後）。認可ステップが page-update を止めていれば項目を押せない（ロックなら、鍵を外す方にすれば押せる）。
// ページを削除するボタンは、ページがブックに入っているときだけ出す（ブックの外のページを捨てるのは、書庫の画面）。認可ステップが page-remove を止めていれば（ページかブックのロックなど）押せない。
// 上に重ねたモーダルで確かめてから page-remove を行う（中身ごと消え、戻せないため）。断られたらダイアログを開いたままにする
import { type ReactNode, useEffect, useId, useState } from "react"
import { withSettings } from "../../../core/book"
import type { Page } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { useActions, useAllowed, useBook, useOutsideBinder, usePageById, usePerform } from "../../../ui/view-hooks"
import { useSettingControls } from "../book-settings/SettingControls"
import { Confirm } from "../dialog-host/Confirm"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form, rowClass } from "../dialog-host/FormParts"
import { useOutermostOf } from "../item-parts/parts"
import { kit } from "../kit"
import { LOCK, PAGE_LOCK, PAGE_UNLOCK } from "../lock"
import { LockToggle } from "../lock/LockToggle"
import { pageProblem } from "../pages/page-problems"
import { PAGE_REMOVE } from "../pages/page-remove"
import { PAGE_UPDATE } from "../pages/page-update"
import { changeWithLock } from "../utils/lock"
import { showsPageDelete } from "./opened-lineup"
import { PageProblemsView } from "./PageProblems"
import { usePagePaperControls } from "./PaperControls"

export interface PageSettingsDialogViewProps {
  page: string // 設定を変えるページの id（開いている物の中のページ）
  onClose(): void
  children?: ReactNode // タイプが足す入力Form（設定の項目の下に並ぶ）
  fields?: Readonly<Record<string, unknown>> // タイプがページに足したフィールドの、書いている値（page-update の fields）
  draft?(page: Page): Page // 書いている値を重ねたページ
}

export function PageSettingsDialogView({ page: id, onClose, children, fields, draft }: PageSettingsDialogViewProps) {
  const t = useMessages(kit)
  const form = useId()
  const catalog = useCatalog().core
  const deletes = showsPageDelete(useBook(), useOutsideBinder())
  const outermost = useOutermostOf()
  const page = usePageById(id)
  const [title, setTitle] = useState(page?.title ?? "")
  const [locked, setLocked] = useState(page?.locked === true)
  // 認可ステップが止めていれば項目を押せない（ロックが止めているなら、鍵で外す方にすれば押せる）
  const update = useAllowed(PAGE_UPDATE.id, { page: id })
  const blocked = !update.ok && update.permission !== null && !(update.permission === LOCK.id && !locked)
  // 削除できるか（ページとブックのロック・ほかの認可ステップも見る）
  const removable = useAllowed(PAGE_REMOVE.id, { page: id }).ok
  const [confirming, setConfirming] = useState(false)
  const settings = useSettingControls({ of: "page", page })
  const paper = usePagePaperControls(page)
  const { previewDialog } = useActions()
  const perform = usePerform()
  const pageId = page?.id
  const changed = Object.keys(settings.patch).length > 0
  useEffect(() => {
    previewDialog(changed && outermost && pageId ? { outermost, page: pageId, props: settings.patch } : null)
  }, [changed, outermost, pageId, settings.patch, previewDialog])
  if (!page) return null
  // 選んでいる値（紙・設定の項目の下書き・タイプが書いている値）を重ねたページで、ページの問題を確かめる
  const drafted = withSettings(paper.draft(draft ? draft(page) : page), settings.patch)
  const problem = pageProblem(catalog, drafted)
  const problems = [...(problem ? [{ page: drafted, problem }] : []), ...paper.problems]
  const ready = title.trim() !== "" && problems.length === 0
  const submit = () => {
    const done = changeWithLock(
      page.locked === true,
      locked,
      () => perform(PAGE_LOCK.id, {}, { page: page.id }).ok,
      () => perform(PAGE_UNLOCK.id, {}, { page: page.id }).ok,
      () =>
        perform(
          PAGE_UPDATE.id,
          {
            title,
            ...(changed ? { settings: settings.patch } : {}), // ページの設定の項目を持たないタイプは settings を受けない
            ...paper.patch,
            ...(fields ? { fields } : {}),
          },
          { page: page.id },
        ).ok,
    )
    if (done) onClose()
  }
  const remove = () => {
    if (perform(PAGE_REMOVE.id, { page: page.id }).ok) onClose()
    else setConfirming(false)
  }
  return (
    <Dialog
      title={t("Page settings")}
      aside={<LockToggle locked={locked} label={t(locked ? "Unlock page" : "Lock page")} onChange={setLocked} />}
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
      <Form id={form} ready={ready} disabled={blocked} onSubmit={submit}>
        <Field label={t("Page name")}>
          {fid => <input id={fid} className={controlClass} value={title} onChange={e => setTitle(e.target.value)} />}
        </Field>
        {paper.controls}
        {settings.controls}
        {children}
        <PageProblemsView problems={problems} />
        {deletes && (
          <div className={rowClass}>
            <ActionButton danger disabled={!removable} onClick={() => setConfirming(true)}>
              {t("Delete page")}
            </ActionButton>
          </div>
        )}
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
