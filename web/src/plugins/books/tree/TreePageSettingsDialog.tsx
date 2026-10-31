// ツリーのページの設定のダイアログ（根のダイアログを兼ねる）: ページ名・伸びる向き・節の大きさ（ページの設定の項目。無ければブックを継承）と、
// 根のキャプション・本文・本文を紙に描くか（ページのフィールド root）を並べる。見出しの行の右にキャンセルと確定のボタン。
// 設定の項目はタイプが選んだ物（base の useSettingControls）を並べ、選んだそばからページに重ねて見せる（ダイアログの下書き）。
// 選んでいる値でページに問題（木が紙に入らないなど）が出れば、その知らせを出して確定できない。
// 確定でアクション page-update（設定の項目は settings、根は fields）を書く。ページを削除するボタンは、上に重ねたモーダルで確かめてから page-remove を行う（断られたら開いたまま）。
// 見出しの右の鍵でロックを切り替え、確定で page-lock・page-unlock を行う（外すのは書く前、掛けるのは書いた後）。削除のボタンは、認可ステップが page-remove を止めていれば
// 押せない。認可ステップが page-update を止めていれば項目を押せない（ロックなら、鍵を外す方にすれば押せる）
import { useEffect, useId, useState } from "react"
import { type PageSettingsArgs, pagedOf, putPage, withSettings } from "../../../plugin-api"
import { type DialogProps, useActions, useAllowed, useBook, useMessages, usePerform } from "../../../plugin-api/ui"
import { BODY_MAX, changeWithLock } from "../../base"
import {
  ActionButton,
  Confirm,
  controlClass,
  Dialog,
  Field,
  Form,
  LockToggle,
  PageProblemsView,
  RichBody,
  rowClass,
  Switch,
  usePageProblems,
  useSettingControls,
} from "../../base/ui"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"

export function TreePageSettingsDialog({ stage, args, onClose }: DialogProps<PageSettingsArgs>) {
  const t = useMessages(kit)
  const form = useId()
  const book = pagedOf(useBook(stage))
  const page = book?.pages.find(p => p.id === args.page)
  const root = TreeRootSchema.safeParse(page && "root" in page ? page.root : undefined)
  const perform = usePerform(stage)
  const { previewDialog } = useActions()
  const [title, setTitle] = useState(page?.title ?? "")
  const settings = useSettingControls(book, "page", page ?? null)
  const [caption, setCaption] = useState(root.success ? root.data.caption : "")
  const [body, setBody] = useState(root.success ? (root.data.body ?? "") : "")
  const [showBody, setShowBody] = useState(root.success && root.data.showBody === true)
  const [confirming, setConfirming] = useState(false)
  const [locked, setLocked] = useState(page?.locked === true)
  // 認可ステップが止めていれば項目を押せない（ロックが止めているなら、鍵で外す方にすれば押せる）
  const update = useAllowed(stage, "@matomezu/base:page-update", { page: args.page })
  const blocked = !update.ok && update.permission !== null && !(update.permission === "@matomezu/base:lock" && !locked)
  const removable = useAllowed(stage, "@matomezu/base:page-remove", { page: args.page }).ok
  const bookId = book?.id
  const pageId = page?.id
  const changed = Object.keys(settings.patch).length > 0
  useEffect(() => {
    previewDialog(changed && bookId && pageId ? { book: bookId, page: pageId, props: settings.patch } : null)
  }, [changed, bookId, pageId, settings.patch, previewDialog])
  // 選んでいる値（設定の項目の下書きと、書いている根）を重ねたページで、ページの問題（木が紙に入らないなど）を確かめる
  const draft =
    book && page && root.success
      ? (() => {
          const { body: _body, showBody: _show, ...rest } = root.data
          const draftRoot = { ...rest, caption, ...(body ? { body } : {}), ...(showBody ? { showBody } : {}) }
          return putPage(book, withSettings({ ...page, root: draftRoot }, settings.patch))
        })()
      : undefined
  const problems = usePageProblems(draft, pageId ? [pageId] : [])
  if (!book || !page || !root.success) return null
  const ready = title.trim() !== "" && problems.length === 0
  const submit = () => {
    const done = changeWithLock(
      page.locked === true,
      locked,
      () => perform("@matomezu/base:page-lock", { page: page.id }).ok,
      () => perform("@matomezu/base:page-unlock", { page: page.id }).ok,
      () =>
        perform("@matomezu/base:page-update", {
          page: page.id,
          title,
          settings: settings.patch,
          fields: { root: { caption, body: body === "" ? null : body, showBody } },
        }).ok,
    )
    if (done) onClose()
  }
  const remove = () => {
    if (perform("@matomezu/base:page-remove", { page: page.id }).ok) onClose()
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
        {settings.controls}
        <Field label={t("Root caption")}>
          {fid => (
            <input id={fid} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />
          )}
        </Field>
        <Field label={t("Root body")}>
          {fid => (
            <RichBody
              id={fid}
              stage={stage}
              label={t("Root body")}
              rows={4}
              maxLength={BODY_MAX}
              value={body}
              onChange={setBody}
            />
          )}
        </Field>
        <div className={rowClass}>
          <span>{t("Show the body on the paper")}</span>
          <Switch label={t("Show the body on the paper")} checked={showBody} onChange={setShowBody} />
        </div>
        <PageProblemsView problems={problems} />
        <div className={rowClass}>
          <ActionButton danger disabled={!removable} onClick={() => setConfirming(true)}>
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
