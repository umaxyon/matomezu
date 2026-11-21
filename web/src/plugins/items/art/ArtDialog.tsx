// シェイプのダイアログ: 追加と編集で同じ並び（キャプション・色）。絵は聞かない（置く絵はツールボックスで決まっている）。
// 色は色を選ぶポップアップで、ページのテーマの代表色か、好きな色を選ぶ。編集では、選んだ色を決める前から絵に重ねて見せる（ダイアログの下書き）。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は決めた項目の値を、開いた側が渡した置き方（ShapeAddArgs の place）に渡す（置く・選ぶ・断りの文は開いた側が持つ）。編集は絵の項目を書き換える（アクション item-update）
import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, ShapeAddArgs } from "../../../plugin-api"
import { type DialogProps, useActions, useCoreCatalog, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import {
  ActionButton,
  ColorPicker,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  rowClass,
  useOutermostOf,
  usePageTheme,
  useSwatches,
} from "../../base/ui"
import { ART_FILL, type PERSON } from "./art"
import { kit } from "./kit"

type ArtProps = ItemProps<typeof PERSON.item.id>

// 絵を置く追加のダイアログ（どの絵を置くかは、開いた側が place に閉じ込める）
export function AddArtDialog({ args, onClose }: DialogProps<ShapeAddArgs>) {
  const outermost = useOutermostOf()
  const pageTheme = usePageTheme()
  const add = (props: ArtProps) => {
    const no = args.place(props)
    if (no === null) onClose()
    return no
  }
  return (
    <ArtDialog
      title={kit.message("Add picture")}
      submit={kit.message("Add")}
      start={{ caption: "" }}
      pageTheme={pageTheme}
      ready={outermost !== undefined}
      onSubmit={add}
      onClose={onClose}
    />
  )
}

export function EditArtDialog({ args, onClose }: DialogProps<{ page: string; item: string }>) {
  const catalog = useCoreCatalog()
  const outermost = useOutermostOf()
  const pageTheme = usePageTheme()
  const placed = useItem(args.page, args.item)
  const start = placed?.props as ArtProps | undefined
  const { previewDialog } = useActions()
  const perform = usePerform()
  const preview = useCallback(
    (color: ArtProps["color"] | null) =>
      previewDialog(color !== null && outermost ? { outermost, item: args.item, props: { color } } : null),
    [outermost, args.item, previewDialog],
  )
  if (!outermost || !start) return null
  const update = (props: ArtProps) => {
    // 色の「なし」に戻したら、絵の色の項目を消す
    const done = perform(
      "@matomezu/paper:item-update",
      {
        item: args.item,
        props: { ...props, color: props.color ?? null },
      },
      { page: args.page },
    )
    if (done.ok) onClose()
    return done.ok ? null : refusalMessage(catalog, done, kit.message("Does not fit on the paper"))
  }
  return (
    <ArtDialog
      title={kit.message("Edit picture")}
      submit={kit.message("OK")}
      start={start}
      pageTheme={pageTheme}
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
  pageTheme,
  ready,
  onSubmit,
  onPreview,
  onClose,
}: {
  title: MessageKey
  submit: MessageKey
  start: ArtProps
  pageTheme: string | undefined // ページのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: ArtProps) => MessageKey | null // 断られたわけの文言（決められたら null）
  onPreview?: (color: ArtProps["color"] | null) => void // 色を選んだ（元の値に戻せば null。無ければ見せない）
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [caption, setCaption] = useState(start.caption)
  const [color, setColor] = useState(start.color)
  // 色の見本: ページのテーマの代表色と、絵の色
  const swatches = useSwatches(pageTheme, ART_FILL)
  useEffect(() => {
    onPreview?.(color !== start.color ? color : null)
  }, [color, start.color, onPreview])
  const [refused, setRefused] = useState<MessageKey | null>(null) // 断られたわけの文言
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
        onSubmit={() => {
          const no = onSubmit({ caption, ...(color ? { color } : {}) })
          setRefused(no)
        }}
      >
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
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}
