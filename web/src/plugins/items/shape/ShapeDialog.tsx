// 形のダイアログ: 追加と編集で同じ並び（キャプション・テーマ・色。キャプションの名前の右に、左・中央・右の寄せ）。形は聞かない（置く形は道具箱で決まっている）。
// テーマは「ブックのテーマ」（形に当てない）か、表にあるテーマから選ぶ。色は色を選ぶポップアップで、形の（無ければブックの）テーマの代表色か、好きな色を選ぶ。
// 編集では、選んだ寄せ・テーマ・色を決める前から形に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに覚えた所に形を置いて（アクション item-place）選び、編集は形の項目を書き換える（アクション item-update）

import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, Point } from "../../../plugin-api"
import { type DialogProps, useActions, useCoreCatalog, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
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
  useAligns,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { kit } from "./kit"
import { SHAPE_FILL } from "./shapes"

type ShapeProps = ItemProps<"@matomezu/shape:shape-rounded">

// 選んだそばから形に見せる項目（寄せ・テーマ・色）
type Look = Pick<ShapeProps, "captionAlign" | "theme" | "color">

const EMPTY: ShapeProps = { caption: "", captionAlign: "center" }

// 形 item を置く追加のダイアログ
export function addShapeDialog(item: string) {
  return function AddShapeDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
    const book = useBookOf(stage)
    const bookTheme = useBookTheme(book)
    const { select } = useActions()
    const perform = usePerform(stage)
    const add = (props: ShapeProps) => {
      if (!book) return false
      const done = perform("@matomezu/paper:item-place", { page: args.page, item, at: args.at, props })
      if (!done.ok) return false
      select(stage, [done.result.item])
      onClose()
      return true
    }
    return (
      <ShapeDialog
        title={kit.message("Add shape")}
        submit={kit.message("Add")}
        start={EMPTY}
        bookTheme={bookTheme}
        ready={book !== undefined}
        onSubmit={add}
        onClose={onClose}
      />
    )
  }
}

export function EditShapeDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const start = useItem(stage, args.page, args.item)?.props as ShapeProps | undefined
  const { previewDialog } = useActions()
  const perform = usePerform(stage)
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: ShapeProps) => {
    // 「ブックのテーマ」・色の「なし」に戻したら、形のテーマ・色の項目を消す
    const done = perform("@matomezu/paper:item-update", {
      page: args.page,
      item: args.item,
      props: { ...props, theme: props.theme ?? null, color: props.color ?? null },
    })
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <ShapeDialog
      title={kit.message("Edit shape")}
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

function ShapeDialog({
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
  start: ShapeProps
  bookTheme: string | undefined // ブックのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: ShapeProps) => boolean // 決められたか
  onPreview?: (look: Look | null) => void // 寄せ・テーマ・色を選んだ（元の値に戻せば null。無ければ見せない）
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [captionAlign, setCaptionAlign] = useState(start.captionAlign)
  const [theme, setTheme] = useState(start.theme ?? "")
  const [color, setColor] = useState(start.color)
  const catalog = useCoreCatalog()
  // 色の見本: 形の（無ければブックの）テーマの代表色と塗り
  const swatches = useSwatches(theme || bookTheme, SHAPE_FILL)
  const changed = captionAlign !== start.captionAlign || theme !== (start.theme ?? "") || color !== start.color
  useEffect(() => {
    onPreview?.(changed ? { captionAlign, theme: theme || undefined, color } : null)
  }, [changed, captionAlign, theme, color, onPreview])
  const aligns = useAligns()
  const [refused, setRefused] = useState(false)
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
          setRefused(!onSubmit({ caption, captionAlign, ...(theme ? { theme } : {}), ...(color ? { color } : {}) }))
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
