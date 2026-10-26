// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文・テーマ・色。キャプションと本文の名前の右に、左・中央・右の寄せ）。
// テーマは「ブックのテーマ」（箱に当てない）か、表にあるテーマから選ぶ。色は色を選ぶポップアップで、箱の（無ければブックの）テーマの代表色か、好きな色を選ぶ。
// 編集では、選んだ寄せ・テーマ・色を決める前から箱に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。見出しの行の右にキャンセルと決めるボタン（キャプションの欄の Enter でも決める）。
// 区切り線は本文が空の間は押せず、本文を書き始めると入る。本文は BODY_MAX 字まで。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに覚えた所に箱を置いて（アクション item-place）選び、編集は箱の項目を書き換える（アクション item-update）

import { useCallback, useEffect, useId, useState } from "react"
import { BODY_MAX, type ItemProps, type MessageKey, type Point, pagedOf, shapesOf } from "../../../plugin-api"
import { type DialogProps, useActions, useMessages } from "../../../plugin-api/ui"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import {
  ActionButton,
  Choices,
  ColorPicker,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  rowClass,
  Switch,
  useAligns,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { BOX, BOX_FILL } from "./box"
import { kit } from "./kit"

type BoxProps = ItemProps<"@matomezu/box:shape-box">

// 選んだそばから箱に見せる項目（寄せ・テーマ・色。テーマの undefined はブックのテーマ、色の undefined はテーマの塗り）
type Look = Pick<BoxProps, "captionAlign" | "bodyAlign" | "theme" | "color">

const EMPTY: BoxProps = { caption: "", rule: true, body: "", captionAlign: "center", bodyAlign: "left" }

export function AddBoxDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const { perform, select } = useActions()
  const add = (props: BoxProps) => {
    if (!book) return false
    const done = perform("@matomezu/paper:item-place", { page: args.page, item: BOX.id, at: args.at, props }, { book })
    if (!done.ok) return false
    select(stage, [done.result.item])
    onClose()
    return true
  }
  return (
    <BoxDialog
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
  const start = useMatomezuState(s => {
    const b = book ? pagedOf(s.books[book]) : undefined
    const page = b?.pages.find(p => p.id === args.page)
    const found = page && shapesOf(page).find(i => i.id === args.item)
    return found?.item === BOX.id ? found.props : undefined
  })
  const { perform, previewDialog } = useActions()
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: BoxProps) => {
    // 「ブックのテーマ」・色の「なし」に戻したら、箱のテーマ・色の項目を消す
    const done = perform(
      "@matomezu/paper:item-update",
      { page: args.page, item: args.item, props: { ...props, theme: props.theme ?? null, color: props.color ?? null } },
      { book },
    )
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <BoxDialog
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
  title,
  submit,
  start,
  bookTheme,
  ready,
  onSubmit,
  onPreview,
  onClose,
}: {
  title: MessageKey
  submit: MessageKey
  start: BoxProps
  bookTheme: string | undefined // ブックのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: BoxProps) => boolean // 決められたか
  onPreview?: (look: Look | null) => void // 寄せ・テーマ・色を選んだ（元の値に戻せば null。無ければ見せない）
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
  const catalog = useCatalog().core
  // 色の見本: 箱の（無ければブックの）テーマの代表色と塗り
  const looks = theme || bookTheme
  const swatches = useSwatches(looks, BOX_FILL)
  const changed =
    captionAlign !== start.captionAlign ||
    bodyAlign !== start.bodyAlign ||
    theme !== (start.theme ?? "") ||
    color !== start.color
  useEffect(() => {
    onPreview?.(changed ? { captionAlign, bodyAlign, theme: theme || undefined, color } : null)
  }, [changed, captionAlign, bodyAlign, theme, color, onPreview])
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
