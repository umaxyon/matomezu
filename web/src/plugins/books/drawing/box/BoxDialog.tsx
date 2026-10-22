// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文・本文の最大の行数）。見出しの行の右にキャンセルと決めるボタン（キャプションの欄の Enter でも決める）。
// 区切り線は本文が空の間は押せず、本文を書き始めると入る。最大の行数は「制限なし」と決まった数から選ぶ（データにほかの数があれば、それも出す）。
// 置けない・変えられない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに覚えた所に箱を置いて（アクション item.place）選び、編集は箱の項目を書き換える（アクション item.update）
import { useId, useState } from "react"
import type { Point } from "../../../../core/geom"
import type { MessageKey } from "../../../../core/i18n/i18n"
import type { ItemProps } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp } from "../../../../ui/store-context"
import { ActionButton, controlClass, Dialog, Field, Form, Problem, rowClass, Switch } from "../../../base/ui"
import { itemsOf } from "../items/items"
import { BOX } from "."

type BoxProps = ItemProps<"shape.box">

// ダイアログで決める中身（bodyLines の null は制限なし）
interface BoxInput {
  caption: string
  rule: boolean
  body: string
  bodyLines: number | null
}

const EMPTY: BoxProps = { caption: "", rule: true, body: "" }

// 本文の最大の行数の選択肢
const LINE_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20]

// 開いたステージで開いているブックの id
const useBookOf = (stage: string) => useApp(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)

export function AddBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
  const book = useBookOf(stage)
  const { perform, select } = useActions()
  const add = ({ bodyLines, ...rest }: BoxInput) => {
    if (!book) return false
    const props = bodyLines === null ? rest : { ...rest, bodyLines }
    const done = perform("item.place", { page: args.page, item: BOX.id, at: args.at, props }, { book })
    if (!done.ok) return false
    select(stage, [done.result.item])
    onClose()
    return true
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
  const update = (props: BoxInput) => {
    const done = perform("item.update", { page: args.page, item: args.item, props: { ...props } }, { book })
    if (done.ok) onClose()
    return done.ok
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
  onSubmit: (input: BoxInput) => boolean // 決められたか
  onClose: () => void
}) {
  const t = useT()
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [body, setBody] = useState(start.body)
  const [rule, setRule] = useState(start.rule)
  const [lines, setLines] = useState<number | null>(start.bodyLines ?? null)
  const [refused, setRefused] = useState(false)
  const hasBody = body !== ""
  const choices = [...new Set([...LINE_CHOICES, ...(start.bodyLines ? [start.bodyLines] : [])])].sort((a, b) => a - b)
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
      <Form id={form} ready={ready} onSubmit={() => setRefused(!onSubmit({ caption, rule, body, bodyLines: lines }))}>
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
        <Field label={t("Max lines")}>
          {id => (
            <select
              id={id}
              className={controlClass}
              value={lines ?? ""}
              onChange={e => setLines(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">{t("No limit")}</option>
              {choices.map(n => (
                <option key={n} value={n}>
                  {t("{n} lines", { n: String(n) })}
                </option>
              ))}
            </select>
          )}
        </Field>
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
