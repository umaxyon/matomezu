// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文・テーマ・色。キャプションと本文の名前の右に、左・中央・右の寄せ）。
// キャプションの寄せの隣に、キャプションと本文の塊の縦の位置（上・真ん中・下）。押している物をもう一度押すと自動（どれも押していない）に戻す。
// 子を持つ内包ボックスでは、真ん中は押せない（子がある間は上として描くため）。
// テーマは「ブックのテーマ」（箱に当てない）か、表にあるテーマから選ぶ。色は色を選ぶポップアップで、箱の（無ければブックの）テーマの代表色か、好きな色を選ぶ。
// 編集では、書いた本文と選んだ寄せ・縦の位置・テーマ・色を決める前から箱に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。見出しの行の右にキャンセルと決めるボタン（キャプションのテキストFormの Enter でも決める）。
// キャプション・区切り線・本文は base の文字の領域の入力Formのコンポーネント（CaptionField・DividerField・BodyField）。
// 置けない（紙からはみ出す・止められたなど）ときは閉じずに理由を出す。
// 追加は開いたときに渡された置く所（ShapeAddArgs）を、そのままアクション item-place に渡して箱を置き（ほかの形は画面と同じに押す）、置いた箱を選ぶ。編集は箱の項目を書き換える（アクション item-update）

import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, ShapeAddArgs } from "../../../plugin-api"
import { type DialogProps, useActions, useCoreCatalog, useItem, useMessages, usePerform } from "../../../plugin-api/ui"
import { refusalMessage } from "../../base"
import {
  ActionButton,
  BodyField,
  CaptionField,
  Choices,
  ColorPicker,
  controlClass,
  Dialog,
  DividerField,
  Field,
  Form,
  Problem,
  rowClass,
  type TextDraft,
  useBookOf,
  useBookTheme,
  useSwatches,
} from "../../base/ui"
import { BOX, BOX_FILL, NEST_BOX } from "./box"
import { kit } from "./kit"
import { VALIGNS, type VAlign } from "./size"

type BoxProps = ItemProps<typeof BOX.id>

// 選んだそばから箱に見せる項目（本文・寄せ・テーマ・色。テーマの undefined はブックのテーマ、色の undefined はテーマの塗り）
type Look = Pick<BoxProps, "body" | "captionAlign" | "bodyAlign" | "vAlign" | "theme" | "color">

const EMPTY: BoxProps = { caption: "", rule: true, body: "", captionAlign: "center", bodyAlign: "left" }

// 追加のダイアログ: 置くアイテム item（箱か内包ボックス）を、中身を決めてから置く
const addDialog = (item: typeof BOX.id | typeof NEST_BOX.id) =>
  function AddDialog(props: DialogProps<ShapeAddArgs>) {
    return <AddBox {...props} item={item} />
  }

export const AddBoxDialog = addDialog(BOX.id)
export const AddNestBoxDialog = addDialog(NEST_BOX.id)

function AddBox({
  stage,
  args,
  onClose,
  item,
}: DialogProps<ShapeAddArgs> & { item: typeof BOX.id | typeof NEST_BOX.id }) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const { select } = useActions()
  const perform = usePerform(stage)
  const add = (props: BoxProps) => {
    if (!book) return { reason: "no-book" }
    const done = perform("@matomezu/paper:item-place", { ...args, item, props, crowd: "push" })
    if (!done.ok) return done
    select(stage, [done.result.item])
    onClose()
    return null
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
  const hasChildren = (nestBox?.shapes?.length ?? 0) > 0
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
      props: { ...props, vAlign: props.vAlign ?? null, theme: props.theme ?? null, color: props.color ?? null },
    })
    if (done.ok) onClose()
    return done.ok ? null : done
  }
  return (
    <BoxDialog
      stage={stage}
      title={kit.message("Edit box")}
      submit={kit.message("OK")}
      start={start}
      hasChildren={hasChildren}
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
  hasChildren = false,
}: {
  stage: string
  title: MessageKey
  submit: MessageKey
  start: BoxProps
  bookTheme: string | undefined // ブックのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: BoxProps) => { reason: string; permission?: string } | null // 断られたわけ（決められたら null）
  onPreview?: (look: Look | null) => void // 本文・寄せ・テーマ・色を変えた（元の値に戻せば null。無ければ見せない）
  onClose: () => void
  hasChildren?: boolean // 子を持つ内包ボックスか（縦の位置の真ん中を押せなくする）
}) {
  const t = useMessages(kit)
  const form = useId()
  const [text, setText] = useState<TextDraft>({
    caption: start.caption,
    rule: start.rule,
    body: start.body,
    captionAlign: start.captionAlign,
    bodyAlign: start.bodyAlign,
  })
  const { body, captionAlign, bodyAlign } = text
  const [vAlign, setVAlign] = useState(start.vAlign)
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
    vAlign !== start.vAlign ||
    theme !== (start.theme ?? "") ||
    color !== start.color
  useEffect(() => {
    onPreview?.(changed ? { body, captionAlign, bodyAlign, vAlign, theme: theme || undefined, color } : null)
  }, [changed, body, captionAlign, bodyAlign, vAlign, theme, color, onPreview])
  const vAligns = VALIGNS.map(v => ({
    value: v,
    label: t(VALIGN_LOOK[v].label),
    icon: VALIGN_LOOK[v].icon,
    disabled: hasChildren && v === "middle",
  }))
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
            ...text,
            ...(vAlign ? { vAlign } : {}),
            ...(theme ? { theme } : {}),
            ...(color ? { color } : {}),
          })
          setRefused(no && refusalMessage(catalog, no, kit.message("Does not fit on the paper")))
        }}
      >
        <CaptionField
          text={text}
          onChange={setText}
          aside={
            <Choices<VAlign>
              label={t("Vertical position")}
              value={vAlign}
              options={vAligns}
              onChange={setVAlign}
              clearable
            />
          }
        />
        <DividerField text={text} onChange={setText} />
        <BodyField stage={stage} text={text} onChange={setText} rows={4} />
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
        {refused && <Problem>{t(refused)}</Problem>}
      </Form>
    </Dialog>
  )
}

// 縦の位置のアイコン（枠の中の上・真ん中・下に短い横線）
const vAlignIcon = (y: number) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d={`M8 ${y}h8`} />
  </svg>
)
const VALIGN_LOOK: Record<VAlign, { label: MessageKey; icon: ReturnType<typeof vAlignIcon> }> = {
  top: { label: kit.message("Top"), icon: vAlignIcon(8) },
  middle: { label: kit.message("Middle"), icon: vAlignIcon(12) },
  bottom: { label: kit.message("Bottom"), icon: vAlignIcon(16) },
}
