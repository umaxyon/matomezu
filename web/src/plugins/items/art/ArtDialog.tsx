// 絵の形のダイアログ: 追加と編集で同じ並び（キャプション・色）。絵は聞かない（置く絵は道具箱で決まっている）。
// 色は色を選ぶポップアップで、ブックのテーマの代表色か、好きな色を選ぶ。編集では、選んだ色を決める前から絵に重ねて見せる（ダイアログの下書き）。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに覚えた所に絵を置いて（アクション item-place）選び、編集は絵の項目を書き換える（アクション item-update）
import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, Point } from "../../../plugin-api"
import { type DialogProps, useActions, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import {
  ActionButton,
  ColorPicker,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  rowClass,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { ART_FILL, type PERSON } from "./art"
import { kit } from "./kit"

type ArtProps = ItemProps<typeof PERSON.item.id>

// 絵 item を置く追加のダイアログ
export function addArtDialog(item: string) {
  return function AddArtDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
    const book = useBookOf(stage)
    const bookTheme = useBookTheme(book)
    const { select } = useActions()
    const perform = usePerform(stage)
    const add = (props: ArtProps) => {
      if (!book) return false
      const done = perform("@matomezu/paper:item-place", { page: args.page, item, at: args.at, props })
      if (!done.ok) return false
      select(stage, [done.result.item])
      onClose()
      return true
    }
    return (
      <ArtDialog
        title={kit.message("Add picture")}
        submit={kit.message("Add")}
        start={{ caption: "" }}
        bookTheme={bookTheme}
        ready={book !== undefined}
        onSubmit={add}
        onClose={onClose}
      />
    )
  }
}

export function EditArtDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const placed = useItem(stage, args.page, args.item)
  const start = placed?.props as ArtProps | undefined
  const { previewDialog } = useActions()
  const perform = usePerform(stage)
  const preview = useCallback(
    (color: ArtProps["color"] | null) =>
      previewDialog(color !== null && book ? { book, item: args.item, props: { color } } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: ArtProps) => {
    // 色の「なし」に戻したら、絵の色の項目を消す
    const done = perform("@matomezu/paper:item-update", {
      page: args.page,
      item: args.item,
      props: { ...props, color: props.color ?? null },
    })
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <ArtDialog
      title={kit.message("Edit picture")}
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

function ArtDialog({
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
  start: ArtProps
  bookTheme: string | undefined // ブックのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: ArtProps) => boolean // 決められたか
  onPreview?: (color: ArtProps["color"] | null) => void // 色を選んだ（元の値に戻せば null。無ければ見せない）
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [color, setColor] = useState(start.color)
  // 色の見本: ブックのテーマの代表色と、絵の色
  const swatches = useSwatches(bookTheme, ART_FILL)
  useEffect(() => {
    onPreview?.(color !== start.color ? color : null)
  }, [color, start.color, onPreview])
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
      <Form id={form} ready={ready} onSubmit={() => setRefused(!onSubmit({ caption, ...(color ? { color } : {}) }))}>
        <Field label={t("Caption")}>
          {id => <input id={id} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
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
