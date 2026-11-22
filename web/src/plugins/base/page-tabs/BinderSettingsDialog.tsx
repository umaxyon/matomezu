// バインダの設定のダイアログ（スライドのバインダなど）: 名前と、中のページ全部の紙と向き。題はバインダのページのタイプの名前から作る（「スライドの設定」）。
// 見出しの行の右にキャンセルと確定のボタン。名前が空の間は確定できない。確定で、変えた項目だけをアクション binder-update に渡す（紙と向きは中のページ全部に 1 回で付く）。断られたらダイアログを開いたままにする。
// 空のバインダ（ページ 0 枚）は、紙をそろえる相手が無いので、紙と向きを押せない（タイプの既定を出す）。
// ブックの外のバインダ（そのバインダを開いたステージ）では、名前は書庫のアクション entry-rename で、紙と向きは binder-update で変え、削除は出さない（消すのは書庫で）。
// 左下の赤い削除のボタンは、上に重ねたモーダルで確かめてから binder-remove を行う（中のページごと消える）。認可ステップが止めていれば押せない
import { useId, useState } from "react"
import { findBinder, pagesIn } from "../../../core/book"
import { pageType } from "../../../core/core-catalog"
import { ORIENTATIONS, type Orientation } from "../../../core/def/paper"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useAllowedOn, useBook, useOutsideBinder, usePerform } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, controlClass, Field, Form, rowClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { ENTRY_RENAME } from "../library/entry-move"
import { BINDER_REMOVE, BINDER_UPDATE } from "../pages/binders"
import type { BinderSettingsArgs } from "."
import { PaperFields } from "./PaperFields"

export function BinderSettingsDialog({ args, onClose }: DialogProps<BinderSettingsArgs>) {
  const t = useMessages(kit)
  const form = useId()
  const catalog = useCatalog().core
  const book = useBook()
  const outside = useOutsideBinder()
  const lineup = book ?? (outside ? { id: outside.id, lineup: [outside] } : undefined)
  const binder = lineup ? findBinder(lineup, args.binder) : undefined
  const type = binder ? catalog.pageTypes.get(binder.pageType) : undefined
  const first = lineup && binder ? pagesIn(lineup, binder.id)[0] : undefined
  const [title, setTitle] = useState(binder?.title ?? "")
  const [paper, setPaper] = useState(first?.paper ?? type?.paper.default ?? "")
  const [orientation, setOrientation] = useState<Orientation>(
    first?.orientation ?? type?.paper.orientation ?? "portrait",
  )
  const on = lineup ? { book: lineup.id } : undefined
  const updatable = useAllowedOn(BINDER_UPDATE.id, { binder: args.binder }, on).ok
  const removable = useAllowedOn(BINDER_REMOVE.id, { binder: args.binder }, on).ok
  const [confirming, setConfirming] = useState(false)
  const perform = usePerform()
  if (!lineup || !binder || !type) return null
  const papers = pageType(catalog, binder.pageType).paper.allowed
  // 変えた項目（紙と向きは、中にページがあるときだけ）
  const renamed = title !== binder.title
  const patch = {
    ...(renamed && book ? { title } : {}),
    ...(first && paper !== first.paper ? { paper } : {}),
    ...(first && orientation !== first.orientation ? { orientation } : {}),
  }
  const ready = title.trim() !== ""
  const submit = () => {
    if (renamed && !book && !perform(ENTRY_RENAME.id, { entry: binder.id, title }).ok) return
    if (Object.keys(patch).length === 0 || perform(BINDER_UPDATE.id, { binder: binder.id, ...patch }).ok) onClose()
  }
  const remove = () => {
    if (perform(BINDER_REMOVE.id, { binder: binder.id }).ok) onClose()
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
        <PaperFields
          papers={papers}
          orientations={ORIENTATIONS}
          paper={paper}
          orientation={orientation}
          locked={!first}
          onPaper={setPaper}
          onOrientation={setOrientation}
        />
        {book && (
          <div className={rowClass}>
            <ActionButton danger disabled={!removable} onClick={() => setConfirming(true)}>
              {t("Delete")}
            </ActionButton>
          </div>
        )}
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
