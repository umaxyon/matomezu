// リストのダイアログ: 追加と編集で同じ並び（キャプション・テーマ・色・チェックリスト・行の色分け）。テーマと色は箱のダイアログと同じ。
// 編集では、選んだテーマ・色・チェックリスト・行の色分けを決める前からリストに重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。
// チェックの入った行があるリストのチェックリストを切ろうとしたら、切る前にその場で確かめる（「チェックの状態が消えます」と、消す・戻すのボタン。
// ダイアログは 1 つしか開けないので、別のダイアログにはしない）。確定すると行のチェックは消える（item.update）。
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
  ColorPicker,
  controlClass,
  Dialog,
  Field,
  Form,
  Problem,
  rowClass,
  Switch,
} from "../../../base/ui"
import { useBookOf, useBookTheme, useSwatches } from "../box/BoxDialog"
import { itemsOf } from "../items/items"
import { LIST, type ListRow } from "."
import styles from "./ListDialog.module.css"
import type { RowsLines } from "./size"

// 全部の行をそろえる行数の選択肢（「最大行」のほか）
const PICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

type ListProps = ItemProps<"shape.list">

// 選んだそばからリストに見せる項目（rowLines は行の高さの下書きで、データには無い）
type Look = Pick<ListProps, "theme" | "color" | "checklist" | "zebra" | "checkedGray" | "checkedOrder"> & {
  rowLines?: RowsLines
}

const EMPTY: ListProps = { caption: "", checklist: false, zebra: false, checkedGray: false, checkedOrder: "none" }

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
  }, [changed, theme, color, checklist, zebra, checkedGray, checkedOrder, rowLines, onPreview])
  const toggleChecklist = (on: boolean) => {
    // チェックの入った行があるリストで切るなら、切る前に確かめる（確かめている間は入ったまま）
    if (!on && start.checklist && checked) setConfirming(true)
    else setChecklist(on)
  }
  return (
    <Dialog
      title={t(title)}
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
        <Field label={t("Caption")}>
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
        </div>
        <div className={rowClass}>
          <span>{t("Alternating row colors")}</span>
          <Switch label={t("Alternating row colors")} checked={zebra} onChange={setZebra} />
        </div>
        <div className={rowClass}>
          <span>{t("Checklist")}</span>
          <Switch label={t("Checklist")} checked={checklist} onChange={toggleChecklist} />
        </div>
        {confirming && (
          <div className={styles.confirm} role="alert">
            <span>{t("Check marks will be removed")}</span>
            <ActionButton
              onClick={() => {
                setConfirming(false)
                setChecklist(false)
              }}
            >
              {t("Remove")}
            </ActionButton>
            <ActionButton onClick={() => setConfirming(false)}>{t("Keep")}</ActionButton>
          </div>
        )}
        {checklist && (
          <fieldset className={styles.group}>
            <legend>{t("Checked rows")}</legend>
            <div className={rowClass}>
              <span>{t("Gray out")}</span>
              <Switch label={t("Gray out")} checked={checkedGray} onChange={setCheckedGray} />
            </div>
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
          </fieldset>
        )}
        {hasRows && (
          <fieldset className={styles.group}>
            <legend>{t("Row height")}</legend>
            <div className={styles.inline}>
              <select
                className={`${controlClass} ${styles.narrow}`}
                aria-label={t("Lines")}
                value={String(pick)}
                onChange={e => setPick(e.target.value === "max" ? "max" : Number(e.target.value))}
              >
                <option value="max">{t("Most lines")}</option>
                {PICKS.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <ActionButton onClick={() => setRowLines(pick)}>{t("Align")}</ActionButton>
            </div>
            <div>
              <ActionButton onClick={() => setRowLines("fit")}>{t("Fit each row to its body")}</ActionButton>
            </div>
          </fieldset>
        )}
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
