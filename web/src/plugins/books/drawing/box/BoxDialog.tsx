// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文・テーマ。キャプションと本文の名前の右に、左・中央・右の寄せ）。
// テーマは「ブックのテーマ」（箱に当てない）か、表にあるテーマから選ぶ。
// 編集では、選んだ寄せとテーマを決める前から箱に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。見出しの行の右にキャンセルと決めるボタン（キャプションの欄の Enter でも決める）。
// 区切り線は本文が空の間は押せず、本文を書き始めると入る。本文は BOX_BODY_MAX 字まで。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに覚えた所に箱を置いて（アクション item.place）選び、編集は箱の項目を書き換える（アクション item.update）
import { useCallback, useEffect, useId, useState } from "react"
import type { Point } from "../../../../core/geom"
import type { MessageKey } from "../../../../core/i18n/i18n"
import type { ItemProps } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry } from "../../../../ui/store-context"
import { ActionButton, Choices, controlClass, Dialog, Field, Form, Problem, rowClass, Switch } from "../../../base/ui"
import { itemsOf } from "../items/items"
import { type Align, BOX } from "."
import { ALIGN_ICONS } from "./icons"
import { BOX_BODY_MAX } from "./size"

type BoxProps = ItemProps<"shape.box">

// 選んだそばから箱に見せる項目（寄せとテーマ。テーマの undefined はブックのテーマ）
type Look = Pick<BoxProps, "captionAlign" | "bodyAlign" | "theme">

const EMPTY: BoxProps = { caption: "", rule: true, body: "", captionAlign: "center", bodyAlign: "left" }

const ALIGNS = [
  { value: "left", label: "Align left" },
  { value: "center", label: "Align center" },
  { value: "right", label: "Align right" },
] as const satisfies readonly { value: Align; label: MessageKey }[]

// 開いたステージで開いているブックの id
const useBookOf = (stage: string) => useApp(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book)

export function AddBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
  const book = useBookOf(stage)
  const { perform, select } = useActions()
  const add = (props: BoxProps) => {
    if (!book) return false
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
  const { perform, previewDialog } = useActions()
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: BoxProps) => {
    // 「ブックのテーマ」に戻したら、箱のテーマの項目を消す
    const done = perform(
      "item.update",
      { page: args.page, item: args.item, props: { ...props, theme: props.theme ?? null } },
      { book },
    )
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <BoxDialog
      title="Edit box"
      submit="OK"
      start={start}
      ready
      onSubmit={update}
      onPreview={preview}
      onClose={onClose}
    />
  )
}

function BoxDialog({
  title,
  submit,
  start,
  ready,
  onSubmit,
  onPreview,
  onClose,
}: {
  title: MessageKey
  submit: MessageKey
  start: BoxProps
  ready: boolean
  onSubmit: (props: BoxProps) => boolean // 決められたか
  onPreview?: (look: Look | null) => void // 寄せかテーマを選んだ（元の値に戻せば null。無ければ見せない）
  onClose: () => void
}) {
  const t = useT()
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [body, setBody] = useState(start.body)
  const [rule, setRule] = useState(start.rule)
  const [captionAlign, setCaptionAlign] = useState(start.captionAlign)
  const [bodyAlign, setBodyAlign] = useState(start.bodyAlign)
  const [theme, setTheme] = useState(start.theme ?? "")
  const registry = useRegistry()
  const changed = captionAlign !== start.captionAlign || bodyAlign !== start.bodyAlign || theme !== (start.theme ?? "")
  useEffect(() => {
    onPreview?.(changed ? { captionAlign, bodyAlign, theme: theme || undefined } : null)
  }, [changed, captionAlign, bodyAlign, theme, onPreview])
  const aligns = ALIGNS.map(a => ({ value: a.value, label: t(a.label), icon: ALIGN_ICONS[a.value] }))
  const [refused, setRefused] = useState(false)
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
      <Form
        id={form}
        ready={ready}
        onSubmit={() =>
          setRefused(!onSubmit({ caption, rule, body, captionAlign, bodyAlign, ...(theme ? { theme } : {}) }))
        }
      >
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
              maxLength={BOX_BODY_MAX}
              value={body}
              onChange={e => {
                if (!hasBody && e.target.value !== "") setRule(true)
                setBody(e.target.value)
              }}
            />
          )}
        </Field>
        <Field label={t("Theme")}>
          {id => (
            <select id={id} className={controlClass} value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="">{t("Book's theme")}</option>
              {[...registry.themes.values()].map(th => (
                <option key={th.id} value={th.id}>
                  {t(th.title)}
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
