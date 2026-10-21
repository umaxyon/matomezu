// 箱の追加のダイアログ: キャプション・区切り線・本文を決め、開いたときに覚えた所に箱を置いて（アクション item.place）選ぶ。
// 見出しの行の右にキャンセルと追加。キャプションの欄の Enter でも追加する。区切り線は本文が空の間は押せず、本文を書き始めると入る
import { useId, useState } from "react"
import type { Point } from "../../../../core/geom"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp } from "../../../../ui/store-context"
import { ActionButton, controlClass, Dialog, Field, Form, rowClass, Switch } from "../../../base/ui"
import { BOX } from "."

export function AddBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
  const t = useT()
  const form = useId()
  const book = useApp(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)
  const { perform, select } = useActions()
  const [caption, setCaption] = useState("")
  const [body, setBody] = useState("")
  const [rule, setRule] = useState(true)
  const hasBody = body !== ""

  const add = () => {
    if (!book) return
    const props = { caption, rule, body }
    const done = perform("item.place", { page: args.page, item: BOX.id, at: args.at, props }, { book })
    if (!done.ok) return
    select(stage, [done.result.item])
    onClose()
  }

  return (
    <Dialog
      title={t("Add box")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("Add")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready={book !== undefined} onSubmit={add}>
        <Field label={t("Caption")}>
          {id => (
            <input
              id={id}
              className={controlClass}
              value={caption}
              autoFocus
              onChange={e => setCaption(e.target.value)}
            />
          )}
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
