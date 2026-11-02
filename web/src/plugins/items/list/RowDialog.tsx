// 行のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文。キャプションと本文の名前の右に、左・中央・右の寄せ）。テーマと色はリストに従うので持たない。
// キャプション・区切り線・本文は base の文字の領域の入力Formのコンポーネント（CaptionField・DividerField・BodyField）。
// 追加はリストの最後に行を足し（row-add）、編集は行の項目を書き換える（row-update。書いた値は確定の前から行に重ねて見せる。ダイアログの下書き）。チェックはダイアログでは変えない（行の印を押して入れ切りする）
// 編集だけに「行を削除」があり、押すと確かめずに行を消して閉じる（row-remove）

import { useCallback, useEffect, useId, useState } from "react"
import type { MessageKey } from "../../../plugin-api"
import { type DialogProps, useActions, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { ActionButton, BodyField, CaptionField, Dialog, DividerField, Form, rowClass, useBookOf } from "../../base/ui"
import { ROW_ADD, ROW_REMOVE, ROW_UPDATE } from "./actions"
import { kit } from "./kit"
import { LIST, type RowProps } from "./list"

type Text = Omit<RowProps, "checked">

const EMPTY: Text = { caption: "", rule: true, body: "", captionAlign: "left", bodyAlign: "left" }

export function AddRowDialog({ stage, args, onClose }: DialogProps<{ page: string; list: string }>) {
  const book = useBookOf(stage)
  const perform = usePerform(stage)
  const add = (props: Text) => {
    if (!book) return
    if (perform(ROW_ADD.id, { page: args.page, list: args.list, props }).ok) onClose()
  }
  return (
    <RowDialog
      stage={stage}
      title={kit.message("Add row")}
      submit={kit.message("Add")}
      start={EMPTY}
      ready={book !== undefined}
      onSubmit={add}
      onClose={onClose}
    />
  )
}

export function EditRowDialog({ stage, args, onClose }: DialogProps<{ page: string; list: string; row: string }>) {
  const book = useBookOf(stage)
  const rows = useItem(stage, args.page, args.list, LIST.id)?.children
  const start = rows?.find(r => r.id === args.row)?.props
  const perform = usePerform(stage)
  const { previewDialog } = useActions()
  // 書いている行の項目を、リストの行に重ねて見せる
  const preview = useCallback(
    (text: Text | null) =>
      previewDialog(
        text && book && rows
          ? {
              book,
              item: args.list,
              props: {},
              content: {
                children: rows.map(r => (r.id === args.row ? { ...r, props: { ...r.props, ...text } } : r)),
              },
            }
          : null,
      ),
    [book, rows, args.list, args.row, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: Text) => {
    if (perform(ROW_UPDATE.id, { page: args.page, list: args.list, row: args.row, props }).ok) onClose()
  }
  const remove = () => {
    if (perform(ROW_REMOVE.id, { page: args.page, list: args.list, rows: [args.row] }).ok) onClose()
  }
  return (
    <RowDialog
      stage={stage}
      title={kit.message("Edit row")}
      submit={kit.message("OK")}
      start={start}
      ready
      onSubmit={update}
      onPreview={preview}
      onRemove={remove}
      onClose={onClose}
    />
  )
}

function RowDialog({
  stage,
  title,
  submit,
  start,
  ready,
  onSubmit,
  onPreview,
  onRemove,
  onClose,
}: {
  stage: string
  title: MessageKey
  submit: MessageKey
  start: Text
  ready: boolean
  onSubmit: (props: Text) => void
  onPreview?: (text: Text | null) => void // 書き換えた（元の値に戻せば null。無ければ見せない）
  onRemove?: () => void
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [text, setText] = useState<Text>({
    caption: start.caption,
    rule: start.rule,
    body: start.body,
    captionAlign: start.captionAlign,
    bodyAlign: start.bodyAlign,
  }) // 編集では start に行のチェックも入っているので、文字の項目だけを取る
  const changed =
    text.caption !== start.caption ||
    text.body !== start.body ||
    text.rule !== start.rule ||
    text.captionAlign !== start.captionAlign ||
    text.bodyAlign !== start.bodyAlign
  useEffect(() => {
    onPreview?.(changed ? text : null)
  }, [changed, text, onPreview])
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
      <Form id={form} ready={ready} onSubmit={() => onSubmit(text)}>
        <CaptionField text={text} onChange={setText} />
        <DividerField text={text} onChange={setText} />
        <BodyField stage={stage} text={text} onChange={setText} rows={4} />
        {onRemove && (
          <div className={rowClass}>
            <ActionButton danger onClick={onRemove}>
              {t("Delete row")}
            </ActionButton>
          </div>
        )}
      </Form>
    </Dialog>
  )
}
