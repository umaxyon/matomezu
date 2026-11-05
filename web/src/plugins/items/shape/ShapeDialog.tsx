// 形のダイアログ: 追加と編集で同じ並び（キャプション・色、回せる形は 90 度回転の切り替え。キャプションの名前の右に、左・中央・右の寄せ）。形は聞かない（置く形は道具箱で決まっている）。
// 色は色を選ぶポップアップで、ブックのテーマの代表色か、好きな色を選ぶ。
// 編集では、選んだ寄せ・色を決める前から形に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。
// 置けない（紙からはみ出すなど）ときは閉じずに理由を出す。
// 追加は開いたときに渡された置く所（ShapeAddArgs）を、そのままアクション item-place に渡して形を置き選び、編集は形の項目を書き換える（アクション item-update）

import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, ShapeAddArgs } from "../../../plugin-api"
import {
  type DialogProps,
  useActions,
  useBook,
  useCoreCatalog,
  useItem,
  useMessages,
  usePerform,
} from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import {
  ActionButton,
  CaptionField,
  ColorPicker,
  Dialog,
  Form,
  Problem,
  rowClass,
  Switch,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { kit } from "./kit"
import { type ROUNDED, SHAPE_FILL, startTurned, TURNABLE } from "./shapes"

// 形の項目（回せる形は向き turned も持つ）
type ShapeProps = ItemProps<typeof ROUNDED.item.id> & { turned?: boolean }

// 選んだそばから形に見せる項目（寄せ・色）
type Look = Pick<ShapeProps, "captionAlign" | "color">

const EMPTY: ShapeProps = { caption: "", captionAlign: "center" }

// 形 item を置く追加のダイアログ。回せる形（turnable）は、ブックのタイプが渡す指定（ShapeOptions の turned）で最初の向きを選ぶ
export function addShapeDialog(item: string, turnable = false) {
  return function AddShapeDialog({ stage, args, onClose }: DialogProps<ShapeAddArgs>) {
    const book = useBookOf(stage)
    const bookTheme = useBookTheme(book)
    const catalog = useCoreCatalog()
    const opened = useBook(stage)
    const turned = opened ? startTurned(catalog, opened, args.page, item) : false
    const { select } = useActions()
    const perform = usePerform(stage)
    const add = (props: ShapeProps) => {
      if (!book) return { reason: "no-book" }
      const done = perform("@matomezu/paper:item-place", { ...args, item, props })
      if (!done.ok) return done
      select(stage, [done.result.item])
      onClose()
      return null
    }
    return (
      <ShapeDialog
        title={kit.message("Add shape")}
        submit={kit.message("Add")}
        start={turnable ? { ...EMPTY, turned } : EMPTY}
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
  const placed = useItem(stage, args.page, args.item)
  // 回せる形は、向きの切り替えを出す（向きを書いていないデータは縦向き）
  const props = placed?.props as ShapeProps | undefined
  const start = props && placed && TURNABLE.includes(placed.item) ? { ...props, turned: props.turned ?? false } : props
  const { previewDialog } = useActions()
  const perform = usePerform(stage)
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !start) return null
  const update = (props: ShapeProps) => {
    // 色の「なし」に戻したら、形の色の項目を消す
    const done = perform("@matomezu/paper:item-update", {
      page: args.page,
      item: args.item,
      props: { ...props, color: props.color ?? null },
    })
    if (done.ok) onClose()
    return done.ok ? null : done
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
  onSubmit: (props: ShapeProps) => { reason: string; permission?: string } | null // 断られたわけ（決められたら null）
  onPreview?: (look: Look | null) => void // 寄せ・色を選んだ（元の値に戻せば null。無ければ見せない）
  onClose: () => void
}) {
  const t = useMessages(kit)
  const form = useId()
  const [head, setHead] = useState({ caption: start.caption, captionAlign: start.captionAlign }) // キャプションと寄せ
  const { caption, captionAlign } = head
  const catalog = useCoreCatalog()
  const [color, setColor] = useState(start.color)
  const [turned, setTurned] = useState(start.turned)
  // 色の見本: ブックのテーマの代表色と塗り
  const swatches = useSwatches(bookTheme, SHAPE_FILL)
  const changed = captionAlign !== start.captionAlign || color !== start.color
  useEffect(() => {
    onPreview?.(changed ? { captionAlign, color } : null)
  }, [changed, captionAlign, color, onPreview])
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
          const no = onSubmit({
            caption,
            captionAlign,
            ...(color ? { color } : {}),
            ...(turned === undefined ? {} : { turned }),
          })
          setRefused(no && refusalMessage(catalog, no, kit.message("Does not fit on the paper")))
        }}
      >
        <CaptionField text={head} onChange={setHead} />
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
        {turned !== undefined && (
          <div className={rowClass}>
            <span>{t("Rotate 90°")}</span>
            <Switch label={t("Rotate 90°")} checked={turned} onChange={setTurned} />
          </div>
        )}
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}
