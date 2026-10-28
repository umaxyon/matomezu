// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文・テーマ・色。キャプションと本文の名前の右に、左・中央・右の寄せ）。
// テーマは「ブックのテーマ」（箱に当てない）か、表にあるテーマから選ぶ。色は色を選ぶポップアップで、箱の（無ければブックの）テーマの代表色か、好きな色を選ぶ。
// 編集では、書いた本文と選んだ寄せ・テーマ・色を決める前から箱に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。見出しの行の右にキャンセルと決めるボタン（キャプションのテキストFormの Enter でも決める）。
// 区切り線は本文が空の間は押せず、本文を書き始めると入る。本文は BODY_MAX 字まで、上の装飾のボックスで太字と文字の色を付けられる（base の RichBody）。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに覚えた所に箱を置いて（アクション item-place）選び、編集は箱の項目を書き換える（アクション item-update）

import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, Point } from "../../../plugin-api"
import { type DialogProps, useActions, useCoreCatalog, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { BODY_MAX } from "../../base"
import {
  ActionButton,
  Choices,
  ColorPicker,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  RichBody,
  rowClass,
  Switch,
  useAligns,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { BOX, BOX_FILL, NEST_BOX } from "./box"
import { kit } from "./kit"

type BoxProps = ItemProps<typeof BOX.id>

// 選んだそばから箱に見せる項目（本文・寄せ・テーマ・色。テーマの undefined はブックのテーマ、色の undefined はテーマの塗り）
type Look = Pick<BoxProps, "body" | "captionAlign" | "bodyAlign" | "theme" | "color">

const EMPTY: BoxProps = { caption: "", rule: true, body: "", captionAlign: "center", bodyAlign: "left" }

// 追加のダイアログ: 置くアイテム item（箱か内包ボックス）を、中身を決めてから置く
const addDialog = (item: typeof BOX.id | typeof NEST_BOX.id) =>
  function AddDialog(props: DialogProps<{ page: string; at: Point }>) {
    return <AddBox {...props} item={item} />
  }

export const AddBoxDialog = addDialog(BOX.id)
export const AddNestBoxDialog = addDialog(NEST_BOX.id)

function AddBox({
  stage,
  args,
  onClose,
  item,
}: DialogProps<{ page: string; at: Point }> & { item: typeof BOX.id | typeof NEST_BOX.id }) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const { select } = useActions()
  const perform = usePerform(stage)
  const add = (props: BoxProps) => {
    if (!book) return false
    const done = perform("@matomezu/paper:item-place", { page: args.page, item, at: args.at, props })
    if (!done.ok) return false
    select(stage, [done.result.item])
    onClose()
    return true
  }
  return (
    <BoxDialog
      stage={stage}
      title={kit.message("Add box")}
      submit={kit.message("Add")}
      start={EMPTY}
      bookTheme={bookTheme}
      ready={book !== undefined}
      onSubmit={add}
      onClose={onClose}
    />
  )
}

export function EditBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  // 編集するのは箱か内包ボックス（項目は同じ）
  const box = useItem(stage, args.page, args.item, BOX.id)
  const nestBox = useItem(stage, args.page, args.item, NEST_BOX.id)
  const start = (box ?? nestBox)?.props
  const { previewDialog } = useActions()
  const perform = usePerform(stage)
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: BoxProps) => {
    // 「ブックのテーマ」・色の「なし」に戻したら、箱のテーマ・色の項目を消す
    const done = perform("@matomezu/paper:item-update", {
      page: args.page,
      item: args.item,
      props: { ...props, theme: props.theme ?? null, color: props.color ?? null },
    })
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <BoxDialog
      stage={stage}
      title={kit.message("Edit box")}
      submit={kit.message("OK")}
      start={start}
      bookTheme={bookTheme}
      ready
      onSubmit={update}
      onPreview={preview}
      onClose={onClose}
    />
  )
}

function BoxDialog({
  stage,
  title,
  submit,
  start,
  bookTheme,
  ready,
  onSubmit,
  onPreview,
  onClose,
}: {
  stage: string
  title: MessageKey
  submit: MessageKey
  start: BoxProps
  bookTheme: string | undefined // ブックのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: BoxProps) => boolean // 決められたか
  onPreview?: (look: Look | null) => void // 本文・寄せ・テーマ・色を変えた（元の値に戻せば null。無ければ見せない）
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [body, setBody] = useState(start.body)
  const [rule, setRule] = useState(start.rule)
  const [captionAlign, setCaptionAlign] = useState(start.captionAlign)
  const [bodyAlign, setBodyAlign] = useState(start.bodyAlign)
  const [theme, setTheme] = useState(start.theme ?? "")
  const [color, setColor] = useState(start.color)
  const catalog = useCoreCatalog()
  // 色の見本: 箱の（無ければブックの）テーマの代表色と塗り
  const looks = theme || bookTheme
  const swatches = useSwatches(looks, BOX_FILL)
  const changed =
    body !== start.body ||
    captionAlign !== start.captionAlign ||
    bodyAlign !== start.bodyAlign ||
    theme !== (start.theme ?? "") ||
    color !== start.color
  useEffect(() => {
    onPreview?.(changed ? { body, captionAlign, bodyAlign, theme: theme || undefined, color } : null)
  }, [changed, body, captionAlign, bodyAlign, theme, color, onPreview])
  const aligns = useAligns()
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
          setRefused(
            !onSubmit({
              caption,
              rule,
              body,
              captionAlign,
              bodyAlign,
              ...(theme ? { theme } : {}),
              ...(color ? { color } : {}),
            }),
          )
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
            <RichBody
              id={id}
              stage={stage}
              rows={4}
              maxLength={BODY_MAX}
              value={body}
              onChange={text => {
                if (!hasBody && text !== "") setRule(true)
                setBody(text)
              }}
            />
          )}
        </Field>
        <Field label={t("Theme")}>
          {id => (
            <select id={id} className={controlClass} value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="">{t("Book's theme")}</option>
              {[...catalog.themes.values()].map(th => (
                <option key={th.id} value={th.id}>
                  {t(th.title)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {swatches && (
          <div className={rowClass}>
            <span>{t("Color")}</span>
            <ColorPicker
              label={t("Color")}
              value={color}
              palette={swatches.palette}
              none={swatches.none}
              onChange={setColor}
            />
          </div>
        )}
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
