// 箱のダイアログ: 追加と編集で同じ並び（キャプション・区切り線・本文・テーマ・色。キャプションと本文の名前の右に、左・中央・右の寄せ）。
// キャプションの寄せの隣に、キャプションと本文の塊の縦の位置（上・真ん中・下）。押している物をもう一度押すと自動（どれも押していない）に戻す。
// 子を持つ内包ボックスでは、真ん中は押せない（子がある間は上として描くため）。
// テーマは「ページのテーマ」（箱に当てない）か、ページのタイプが使えるテーマから選ぶ。色は色を選ぶポップアップで、箱の（無ければページの）テーマの代表色か、好きな色を選ぶ。
// 編集では、書いた本文と選んだ寄せ・縦の位置・テーマ・色を決める前から箱に重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。見出しの行の右にキャンセルと決めるボタン（キャプションのテキストFormの Enter でも決める）。
// キャプション・区切り線・本文は base の文字の領域の入力Formのコンポーネント（CaptionField・DividerField・BodyField）。
// 置けない（紙からはみ出す・止められたなど）ときは閉じずに理由を出す。
// 追加は決めた項目の値を、開いた側が渡した置き方（ShapeAddArgs の place）に渡す（置く・選ぶ・断りの文は開いた側が持つ）。編集は箱の項目を書き換える（アクション item-update）

import { useCallback, useEffect, useId, useState } from "react"
import type { ItemProps, MessageKey, ShapeAddArgs } from "../../../plugin-api"
import { NO_ITEM } from "../../../plugin-api"
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
  useOutermostOf,
  usePageTheme,
  usePageThemes,
  useSwatches,
} from "../../base/ui"
import { BOX, BOX_FILL, NEST_BOX } from "./box"
import { kit } from "./kit"

import { VALIGNS, type VAlign } from "./size"

type BoxProps = ItemProps<typeof BOX.id>

// 選んだそばから箱に見せる項目（本文・寄せ・テーマ・色。テーマの undefined はページのテーマ、色の undefined はテーマの塗り）
type Look = Pick<BoxProps, "body" | "captionAlign" | "bodyAlign" | "vAlign" | "theme" | "color">

const EMPTY: BoxProps = { caption: "", rule: true, body: "", captionAlign: "center", bodyAlign: "left" }

// 追加のダイアログ: 箱か内包ボックスを、中身を決めてから置く（どちらを置くかは、開いた側が place に閉じ込める）
export function AddBoxDialog({ args, onClose }: DialogProps<ShapeAddArgs>) {
  const outermost = useOutermostOf()
  const pageTheme = usePageTheme()
  const add = (props: BoxProps) => {
    const no = args.place(props)
    if (no === null) onClose()
    return no
  }
  return (
    <BoxDialog
      title={kit.message("Add box")}
      submit={kit.message("Add")}
      start={EMPTY}
      pageTheme={pageTheme}
      ready={outermost !== undefined}
      onSubmit={add}
      onClose={onClose}
    />
  )
}

export function EditBoxDialog({ args, onClose }: DialogProps<{ page: string; item: string }>) {
  const catalog = useCoreCatalog()
  const outermost = useOutermostOf()
  const pageTheme = usePageTheme()
  // 編集するのは箱か内包ボックス（項目は同じ）
  const box = useItem(args.page, args.item, BOX.id)
  const nestBox = useItem(args.page, args.item, NEST_BOX.id)
  const start = box !== NO_ITEM ? box.props : nestBox !== NO_ITEM ? nestBox.props : undefined
  const hasChildren = nestBox !== NO_ITEM && (nestBox.shapes?.length ?? 0) > 0
  const { previewDialog } = useActions()
  const perform = usePerform()
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && outermost ? { outermost, item: args.item, props: look } : null),
    [outermost, args.item, previewDialog],
  )
  if (!outermost || !start) return null
  const update = (props: BoxProps) => {
    // 「ページのテーマ」・色の「なし」に戻したら、箱のテーマ・色の項目を消す
    const done = perform(
      "@matomezu/paper:item-update",
      {
        item: args.item,
        props: {
          ...props,
          vAlign: props.vAlign ?? null,
          // テーマは変えたときだけ送る（使えないテーマが残っていても、ほかの項目は直せる）
          ...(props.theme === start.theme ? {} : { theme: props.theme ?? null }),
          color: props.color ?? null,
        },
      },
      { page: args.page },
    )
    if (done.ok) onClose()
    return done.ok ? null : refusalMessage(catalog, done, kit.message("Does not fit on the paper"))
  }
  return (
    <BoxDialog
      title={kit.message("Edit box")}
      submit={kit.message("OK")}
      start={start}
      hasChildren={hasChildren}
      pageTheme={pageTheme}
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
  pageTheme,
  ready,
  onSubmit,
  onPreview,
  onClose,
  hasChildren = false,
}: {
  title: MessageKey
  submit: MessageKey
  start: BoxProps
  pageTheme: string | undefined // ページのテーマの id（色の見本に使う）
  ready: boolean
  onSubmit: (props: BoxProps) => MessageKey | null // 断られたわけの文言（決められたら null）
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
  const themes = usePageThemes() // ページのタイプが使えるテーマ
  // 始めのテーマ（使えないテーマが残っていれば「ページのテーマ」から始める。データのテーマは変えない限り残す）
  const startTheme = themes.some(th => th.id === start.theme) ? (start.theme ?? "") : ""
  const [theme, setTheme] = useState(startTheme)
  const [color, setColor] = useState(start.color)
  // 色の見本: 箱の（無ければページの）テーマの代表色と塗り
  const looks = theme || pageTheme
  const swatches = useSwatches(looks, BOX_FILL)
  const changed =
    body !== start.body ||
    captionAlign !== start.captionAlign ||
    bodyAlign !== start.bodyAlign ||
    vAlign !== start.vAlign ||
    theme !== startTheme ||
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
            ...(theme === startTheme ? (start.theme ? { theme: start.theme } : {}) : theme ? { theme } : {}),
            ...(color ? { color } : {}),
          })
          setRefused(no)
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
        <BodyField text={text} onChange={setText} rows={4} />
        <Field label={t("Theme")}>
          {id => (
            <select id={id} className={controlClass} value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="">{t("Page's theme")}</option>
              {themes.map(th => (
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
