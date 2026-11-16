// フォルダの設定のダイアログ（スライドのフォルダなど、まとまるタイプのページの入れ物）: 名前と、中のページ全部の紙と向き。題はフォルダのページのタイプの名前から作る（「スライドの設定」）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。確定で、変えた項目だけをアクション folder-update に渡す（紙と向きは中のページ全部に 1 回で付く）。断られたらダイアログを開いたままにする。
// 空のフォルダ（ページ 0 枚）は、紙をそろえる相手が無いので、紙と向きを押せない（タイプの既定を出す）。
// 左下の赤い削除のボタンは、上に重ねたモーダルで確かめてから folder-remove を行う（中のページごと消える）。認可ステップが止めていれば押せない
import { useId, useState } from "react"
import { findFolder, pagesIn } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import { ORIENTATIONS, type Orientation } from "../../../core/def/paper"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useAllowedOn, useBook, usePerform } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form, rowClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { FolderSettingsArgs } from "."
import { FOLDER_REMOVE, FOLDER_UPDATE } from "./folders"
import { ORIENTATION_TITLES } from "./PaperControls"

export function FolderSettingsDialog({ args, onClose }: DialogProps<FolderSettingsArgs>) {
  const t = useMessages(kit)
  const form = useId()
  const catalog = useCatalog().core
  const book = useBook()
  const folder = book ? findFolder(book, args.folder) : undefined
  const type = folder ? catalog.pageTypes.get(folder.pageType) : undefined
  const first = book && folder ? pagesIn(book, folder.id)[0] : undefined
  const [title, setTitle] = useState(folder?.title ?? "")
  const [paper, setPaper] = useState(first?.paper ?? type?.paper.default ?? "")
  const [orientation, setOrientation] = useState<Orientation>(
    first?.orientation ?? type?.paper.orientation ?? "portrait",
  )
  const on = book ? { book: book.id } : undefined
  const updatable = useAllowedOn(FOLDER_UPDATE.id, { folder: args.folder }, on).ok
  const removable = useAllowedOn(FOLDER_REMOVE.id, { folder: args.folder }, on).ok
  const [confirming, setConfirming] = useState(false)
  const perform = usePerform()
  if (!book || !folder || !type) return null
  const papers = pageType(catalog, folder.pageType).paper.allowed
  // 変えた項目（紙と向きは、中にページがあるときだけ）
  const patch = {
    ...(title !== folder.title ? { title } : {}),
    ...(first && paper !== first.paper ? { paper } : {}),
    ...(first && orientation !== first.orientation ? { orientation } : {}),
  }
  const ready = title.trim() !== ""
  const submit = () => {
    if (Object.keys(patch).length === 0 || perform(FOLDER_UPDATE.id, { folder: folder.id, ...patch }).ok) onClose()
  }
  const remove = () => {
    if (perform(FOLDER_REMOVE.id, { folder: folder.id }).ok) onClose()
    else setConfirming(false)
  }
  return (
    <Dialog
      title={t("{type} settings", { type: t(type.title) })}
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
      <Form id={form} ready={ready} disabled={!updatable} onSubmit={submit}>
        <Field label={t("Name")}>
          {fid => <input id={fid} className={controlClass} value={title} onChange={e => setTitle(e.target.value)} />}
        </Field>
        <Field label={t("Paper size")}>
          {fid => (
            <select
              id={fid}
              className={controlClass}
              value={paper}
              disabled={!first || papers.length < 2}
              onChange={e => setPaper(e.target.value)}
            >
              {papers.map(p => {
                const def = catalog.papers.get(p)
                return (
                  <option key={p} value={p}>
                    {def ? t(def.title) : t("Unknown paper")}
                  </option>
                )
              })}
            </select>
          )}
        </Field>
        <Field label={t("Orientation")}>
          {fid => (
            <select
              id={fid}
              className={controlClass}
              value={orientation}
              disabled={!first}
              onChange={e => setOrientation(ORIENTATIONS.find(o => o === e.target.value) ?? orientation)}
            >
              {ORIENTATIONS.map(o => (
                <option key={o} value={o}>
                  {t(ORIENTATION_TITLES[o])}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className={rowClass}>
          <ActionButton danger disabled={!removable} onClick={() => setConfirming(true)}>
            {t("Delete")}
          </ActionButton>
        </div>
        {confirming && (
          <Confirm
            message={t("The {type} and its pages will be deleted", { type: t(type.title) })}
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
