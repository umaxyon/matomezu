// リストのダイアログ: 追加と編集で同じ並び。キャプション（名前の右に左・中央・右の寄せ）、テーマ・色・行の色分けを横に並べた行、
// チェックリストのスイッチと、入れたときだけ下に開く「チェック済みを」（グレーアウト・並べ替え）、行があるときの「行の高さ」。テーマと色は箱のダイアログと同じ。
// 編集では、選んだ寄せ・テーマ・色・チェックリスト・行の色分け・チェック済みの見せ方・行の高さを決める前からリストに重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。
// チェックの入った行があるリストのチェックリストを切ろうとしたら、切る前に上に重ねたモーダルで確かめる（「チェックの状態が消えます」と、消す・戻すのボタン。base の Confirm）。確定すると行のチェックは消える（item.update）。
// 編集には「行の高さ」（どれも高さの書き換え。決まりではない）: 「中身が見える高さにそろえる」は行ごとにその行の本文が全部見える高さに（行ごとに違う）、
// 「行にそろえる」は選んだ行数（「最大行」なら本文の一番長い行が全部見える行数）に、本文の量によらず全部の行を同じ高さにする。
// これも下書きで見せ、確定で行の行数を書き換える（row.lines）。
// 追加は開いたときに覚えた所にリストを置いて（item.place）選び、編集はリストの項目を書き換える（item.update）
import { useCallback, useEffect, useId, useState } from "react"
import type { Point } from "../../../../core/geom"
import type { MessageKey } from "../../../../core/i18n/i18n"
import type { ItemProps } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry } from "../../../../ui/store-context"
import {
  ActionButton,
  Choices,
  ColorPicker,
  Confirm,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  rowClass,
  SelectButton,
  Switch,
  SwitchPanel,
} from "../../../base/ui"
import { useAligns, useBookOf, useBookTheme, useSwatches } from "../box/BoxDialog"
import { itemsOf } from "../items/items"
import { LIST, type ListRow } from "."
import styles from "./ListDialog.module.css"
import type { RowsLines } from "./size"

// ダイアログの高さ（全部の欄が出たときの高さ。チェックリストなどで欄が増えても大きさを変えない）
const DIALOG_HEIGHT = 480
// ダイアログの幅（行の高さの 2 つの操作が 1 行に並ぶ幅）
const DIALOG_WIDTH = 440

// 全部の行をそろえる行数の選択肢（「最大行」のほか）
const PICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

type ListProps = ItemProps<"shape.list">

// 選んだそばからリストに見せる項目（rowLines は行の高さの下書きで、データには無い）
type Look = Pick<
  ListProps,
  "captionAlign" | "theme" | "color" | "checklist" | "zebra" | "checkedGray" | "checkedOrder"
> & {
  rowLines?: RowsLines
}

const EMPTY: ListProps = {
  caption: "",
  captionAlign: "center",
  checklist: false,
  zebra: false,
  checkedGray: false,
  checkedOrder: "none",
}

export function AddListDialog({ stage, args, onClose }: DialogProps<{ page: string; at: Point }>) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const { perform, select } = useActions()
  const add = (props: ListProps) => {
    if (!book) return false
    const done = perform("item.place", { page: args.page, item: LIST.id, at: args.at, props }, { book })
    if (!done.ok) return false
    select(stage, [done.result.item])
    onClose()
    return true
  }
  return (
    <ListDialog
      title="Add list"
      submit="Add"
      start={EMPTY}
      checked={false}
      bookTheme={bookTheme}
      ready={book !== undefined}
      onSubmit={add}
      onClose={onClose}
    />
  )
}

export function EditListDialog({ stage, args, onClose }: DialogProps<{ page: string; item: string }>) {
  const book = useBookOf(stage)
  const bookTheme = useBookTheme(book)
  const found = useApp(s => {
    const b = book ? (s.books[book] as BookOf<"drawing"> | undefined) : undefined
    const page = b?.pages.find(p => p.id === args.page)
    const item = page && itemsOf(page).find(i => i.id === args.item)
    return item?.item === LIST.id ? item : undefined
  })
  const { perform, previewDialog } = useActions()
  const preview = useCallback(
    (look: Look | null) => previewDialog(look && book ? { book, item: args.item, props: look } : null),
    [book, args.item, previewDialog],
  )
  if (!book || !found) return null
  const rows: readonly ListRow[] = found.children ?? []
  const update = (props: ListProps, rowLines?: RowsLines) => {
    // 「ブックのテーマ」・色の「なし」に戻したら、リストのテーマ・色の項目を消す
    const done = perform(
      "item.update",
      { page: args.page, item: args.item, props: { ...props, theme: props.theme ?? null, color: props.color ?? null } },
      { book },
    )
    if (done.ok && rowLines !== undefined && rows.length > 0)
      perform("row.lines", { page: args.page, list: args.item, lines: rowLines }, { book })
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <ListDialog
      title="Edit list"
      submit="OK"
      start={found.props}
      checked={rows.some(r => r.props.checked === true)}
      hasRows={rows.length > 0}
      bookTheme={bookTheme}
      ready
      onSubmit={update}
      onPreview={preview}
      onClose={onClose}
    />
  )
}

function ListDialog({
  title,
  submit,
  start,
  checked,
  hasRows = false,
  bookTheme,
  ready,
  onSubmit,
  onPreview,
  onClose,
}: {
  title: MessageKey
  submit: MessageKey
  start: ListProps
  checked: boolean // チェックの入った行があるか（チェックリストを切るときに確かめる）
  hasRows?: boolean // 行があるか（あれば「行の高さ」を出す）
  bookTheme: string | undefined
  ready: boolean
  onSubmit: (props: ListProps, rowLines?: RowsLines) => boolean // 決められたか
  onPreview?: (look: Look | null) => void // テーマ・色・チェックリスト・行の色分けを選んだ（元の値に戻せば null）
  onClose: () => void
}) {
  const t = useT()
  const form = useId()
  const registry = useRegistry()
  const [caption, setCaption] = useState(start.caption)
  const [captionAlign, setCaptionAlign] = useState(start.captionAlign)
  const aligns = useAligns()
  const [theme, setTheme] = useState(start.theme ?? "")
  const [color, setColor] = useState(start.color)
  const [checklist, setChecklist] = useState(start.checklist)
  const [zebra, setZebra] = useState(start.zebra)
  const [checkedGray, setCheckedGray] = useState(start.checkedGray)
  const [checkedOrder, setCheckedOrder] = useState(start.checkedOrder)
  const [confirming, setConfirming] = useState(false)
  const [refused, setRefused] = useState(false)
  const [rowLines, setRowLines] = useState<RowsLines | undefined>(undefined)
  const [pick, setPick] = useState<number | "max">("max")
  const swatches = useSwatches(theme || bookTheme)
  const changed =
    captionAlign !== start.captionAlign ||
    theme !== (start.theme ?? "") ||
    color !== start.color ||
    checklist !== start.checklist ||
    zebra !== start.zebra ||
    checkedGray !== start.checkedGray ||
    checkedOrder !== start.checkedOrder ||
    rowLines !== undefined
  useEffect(() => {
    onPreview?.(
      changed
        ? {
            captionAlign,
            theme: theme || undefined,
            color,
            checklist,
            zebra,
            checkedGray,
            checkedOrder,
            ...(rowLines !== undefined ? { rowLines } : {}),
          }
        : null,
    )
  }, [changed, captionAlign, theme, color, checklist, zebra, checkedGray, checkedOrder, rowLines, onPreview])
  const toggleChecklist = (on: boolean) => {
    // チェックの入った行があるリストで切るなら、切る前に確かめる（確かめている間は入ったまま）
    if (!on && start.checklist && checked) setConfirming(true)
    else setChecklist(on)
  }
  return (
    <Dialog
      title={t(title)}
      height={DIALOG_HEIGHT}
      width={DIALOG_WIDTH}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!ready || confirming}>
            {t(submit)}
          </ActionButton>
        </>
      }
    >
      <Form
        id={form}
        ready={ready && !confirming}
        onSubmit={() =>
          setRefused(
            !onSubmit(
              {
                caption,
                captionAlign,
                checklist,
                zebra,
                checkedGray,
                checkedOrder,
                ...(theme ? { theme } : {}),
                ...(color ? { color } : {}),
              },
              rowLines,
            ),
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
        <div className={styles.inline}>
          <label className={styles.pair}>
            <span>{t("Theme")}</span>
            <select className={controlClass} value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="">{t("Book's theme")}</option>
              {[...registry.themes.values()].map(th => (
                <option key={th.id} value={th.id}>
                  {t(th.title)}
                </option>
              ))}
            </select>
          </label>
          {swatches && (
            <span className={styles.pair}>
              <span>{t("Color")}</span>
              <ColorPicker
                label={t("Color")}
                value={color}
                palette={swatches.palette}
                none={swatches.none}
                onChange={setColor}
              />
            </span>
          )}
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.pair}>
            <span>{t("Alternating row colors")}</span>
            <Switch label={t("Alternating row colors")} checked={zebra} onChange={setZebra} />
          </span>
        </div>
        <SwitchPanel label={t("Checklist")} checked={checklist} onChange={toggleChecklist}>
          <fieldset className={styles.sub}>
            <legend>{t("Checked rows")}</legend>
            <div className={styles.heights}>
              <span className={rowClass}>
                <span>{t("Gray out")}</span>
                <Switch label={t("Gray out")} checked={checkedGray} onChange={setCheckedGray} />
              </span>
              <span className={styles.divider} aria-hidden="true" />
              <label className={rowClass}>
                <span>{t("Reorder")}</span>
                <select
                  className={`${controlClass} ${styles.narrow}`}
                  value={checkedOrder}
                  onChange={e => setCheckedOrder(e.target.value as ListProps["checkedOrder"])}
                >
                  <option value="none">{t("Not reordered")}</option>
                  <option value="first">{t("First")}</option>
                  <option value="last">{t("Last")}</option>
                </select>
              </label>
            </div>
          </fieldset>
        </SwitchPanel>
        {confirming && (
          <Confirm
            message={t("Check marks will be removed")}
            ok={t("Remove")}
            cancel={t("Keep")}
            onOk={() => {
              setConfirming(false)
              setChecklist(false)
            }}
            onCancel={() => setConfirming(false)}
          />
        )}
        {hasRows && (
          <fieldset className={styles.group}>
            <legend>{t("Row height")}</legend>
            <div className={styles.heights}>
              <SelectButton
                label={t("Lines")}
                value={String(pick)}
                options={[
                  { value: "max", label: t("Most lines") },
                  ...PICKS.map(n => ({ value: String(n), label: String(n) })),
                ]}
                button={t("Align")}
                onChange={v => setPick(v === "max" ? "max" : Number(v))}
                onClick={() => setRowLines(pick)}
              />
              <span className={styles.divider} aria-hidden="true" />
              <ActionButton onClick={() => setRowLines("fit")}>{t("Fit each row to its body")}</ActionButton>
            </div>
          </fieldset>
        )}
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
