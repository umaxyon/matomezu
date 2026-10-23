// 行のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文。キャプションと本文の名前の右に、左・中央・右の寄せ）。テーマと色はリストに従うので持たない。
// 区切り線は本文が空の間は押せず、本文を書き始めると入る。本文は BODY_MAX 字まで。
// 追加はリストの最後に行を足し（row.add）、編集は行の項目を書き換える（row.update）。チェックはダイアログでは変えない（行の印を押して入れ切りする）
import { useId, useState } from "react"
import type { MessageKey } from "../../../../core/i18n/i18n"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp } from "../../../../ui/store-context"
import { ActionButton, Choices, controlClass, Dialog, Field, Form, rowClass, Switch } from "../../../base/ui"
import { shapesOf } from "../placed"
import { BODY_MAX } from "../shape"
import { useAligns, useBookOf } from "../shape/parts"
import { LIST, type RowProps } from "."

type Text = Omit<RowProps, "checked">

const EMPTY: Text = { caption: "", rule: true, body: "", captionAlign: "left", bodyAlign: "left" }

export function AddRowDialog({ stage, args, onClose }: DialogProps<{ page: string; list: string }>) {
  const book = useBookOf(stage)
  const { perform } = useActions()
  const add = (props: Text) => {
    if (!book) return
    if (perform("row.add", { page: args.page, list: args.list, props }, { book }).ok) onClose()
  }
  return (
    <RowDialog title="Add row" submit="Add" start={EMPTY} ready={book !== undefined} onSubmit={add} onClose={onClose} />
  )
}

export function EditRowDialog({ stage, args, onClose }: DialogProps<{ page: string; list: string; row: string }>) {
  const book = useBookOf(stage)
  const start = useApp(s => {
    const b = book ? (s.books[book] as BookOf<"drawing"> | undefined) : undefined
    const page = b?.pages.find(p => p.id === args.page)
    const list = page && shapesOf(page).find(i => i.id === args.list)
    return list?.item === LIST.id ? list.children?.find(r => r.id === args.row)?.props : undefined
  })
  const { perform } = useActions()
  if (!book || !start) return null
  const update = (props: Text) => {
    if (perform("row.update", { page: args.page, list: args.list, row: args.row, props }, { book }).ok) onClose()
  }
  return <RowDialog title="Edit row" submit="OK" start={start} ready onSubmit={update} onClose={onClose} />
}

function RowDialog({
  title,
  submit,
  start,
  ready,
  onSubmit,
  onClose,
}: {
  title: MessageKey
  submit: MessageKey
  start: Text
  ready: boolean
  onSubmit: (props: Text) => void
  onClose: () => void
}) {
  const t = useT()
  const form = useId()
  const aligns = useAligns()
  const [caption, setCaption] = useState(start.caption)
  const [body, setBody] = useState(start.body)
  const [rule, setRule] = useState(start.rule)
  const [captionAlign, setCaptionAlign] = useState(start.captionAlign)
  const [bodyAlign, setBodyAlign] = useState(start.bodyAlign)
  const hasBody = body !== ""
  return (
    <Dialog
      title={t(title)}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!ready}>
            {t(submit)}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={ready} onSubmit={() => onSubmit({ caption, rule, body, captionAlign, bodyAlign })}>
        <Field
          label={t("Caption")}
          aside={
            <Choices label={t("Caption alignment")} value={captionAlign} options={aligns} onChange={setCaptionAlign} />
          }
        >
          {id => <input id={id} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
        </Field>
        <div className={rowClass}>
          <span>{t("Divider")}</span>
          <Switch label={t("Divider")} checked={rule} disabled={!hasBody} onChange={setRule} />
        </div>
        <Field
          label={t("Body")}
          aside={<Choices label={t("Body alignment")} value={bodyAlign} options={aligns} onChange={setBodyAlign} />}
        >
          {id => (
            <textarea
              id={id}
              className={controlClass}
              rows={4}
              maxLength={BODY_MAX}
              value={body}
              onChange={e => {
                if (!hasBody && e.target.value !== "") setRule(true)
                setBody(e.target.value)
              }}
            />
          )}
        </Field>
      </Form>
    </Dialog>
  )
}
