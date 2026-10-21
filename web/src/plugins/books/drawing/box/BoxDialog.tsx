// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文）。見出しの行の右にキャンセルと決めるボタン（キャプションの欄の Enter でも決める）。
// 区切り線は本文が空の間は押せず、本文を書き始めると入る。
// 追加は開いたときに覚えた所に箱を置いて（アクション item.place）選び、編集は箱の項目を書き換える（アクション item.update）
import { useId, useState } from "react"
import type { Point } from "../../../../core/geom"
import type { MessageKey } from "../../../../core/i18n/i18n"
import type { ItemProps } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp } from "../../../../ui/store-context"
import { ActionButton, controlClass, Dialog, Field, Form, rowClass, Switch } from "../../../base/ui"
import { itemsOf } from "../items/items"
import { BOX } from "."

type BoxProps = ItemProps<"shape.box">

const EMPTY: BoxProps = { caption: "", rule: true, body: "" }

// 開いたステージで開いているブックの id
const useBookOf = (stage: string) => useApp(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)

export function AddBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
  const book = useBookOf(stage)
  const { perform, select } = useActions()
  const add = (props: BoxProps) => {
    if (!book) return
    const done = perform("item.place", { page: args.page, item: BOX.id, at: args.at, props }, { book })
    if (!done.ok) return
    select(stage, [done.result.item])
    onClose()
  }
  return (
    <BoxDialog title="Add box" submit="Add" start={EMPTY} ready={book !== undefined} onSubmit={add} onClose={onClose} />
  )
}

export function EditBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const book = useBookOf(stage)
  const start = useApp(s => {
    const b = book ? (s.books[book] as BookOf<"drawing"> | undefined) : undefined
    const page = b?.pages.find(p => p.id === args.page)
    return page && itemsOf(page).find(i => i.id === args.item && i.item === BOX.id)?.props
  })
  const { perform } = useActions()
  if (!book || !start) return null
  const update = (props: BoxProps) => {
    const done = perform("item.update", { page: args.page, item: args.item, props }, { book })
    if (done.ok) onClose()
  }
  return <BoxDialog title="Edit box" submit="OK" start={start} ready onSubmit={update} onClose={onClose} />
}

function BoxDialog({
  title,
  submit,
  start,
  ready,
  onSubmit,
  onClose,
}: {
  title: MessageKey
  submit: MessageKey
  start: BoxProps
  ready: boolean
  onSubmit: (props: BoxProps) => void
  onClose: () => void
}) {
  const t = useT()
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [body, setBody] = useState(start.body)
  const [rule, setRule] = useState(start.rule)
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
      <Form id={form} ready={ready} onSubmit={() => onSubmit({ caption, rule, body })}>
        <Field label={t("Caption")}>
          {id => <input id={id} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
        </Field>
        <div className={rowClass}>
          <span>{t("Divider")}</span>
          <Switch label={t("Divider")} checked={rule} disabled={!hasBody} onChange={setRule} />
        </div>
        <Field label={t("Body")}>
          {id => (
            <textarea
              id={id}
              className={controlClass}
              rows={4}
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
