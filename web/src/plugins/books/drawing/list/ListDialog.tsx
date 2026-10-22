// リストのダイアログ: 追加と編集で同じ並び（キャプション・テーマ・色・チェックリスト・行の色分け）。テーマと色は箱のダイアログと同じ。
// 編集では、選んだテーマ・色・チェックリスト・行の色分けを決める前からリストに重ねて見せる（ダイアログの下書き。確定で書き、キャンセルでは元のまま）。
// チェックの入った行があるリストのチェックリストを切ろうとしたら、切る前にその場で確かめる（「チェックの状態が消えます」と、消す・戻すのボタン。
// ダイアログは 1 つしか開けないので、別のダイアログにはしない）。確定すると行のチェックは消える（item.update）。
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

type ListProps = ItemProps<"shape.list">

// 選んだそばからリストに見せる項目
type Look = Pick<ListProps, "theme" | "color" | "checklist" | "zebra">

const EMPTY: ListProps = { caption: "", checklist: false, zebra: false }

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
  const update = (props: ListProps) => {
    // 「ブックのテーマ」・色の「なし」に戻したら、リストのテーマ・色の項目を消す
    const done = perform(
      "item.update",
      { page: args.page, item: args.item, props: { ...props, theme: props.theme ?? null, color: props.color ?? null } },
      { book },
    )
    if (done.ok) onClose()
    return done.ok
  }
  return (
    <ListDialog
      title="Edit list"
      submit="OK"
      start={found.props}
      checked={rows.some(r => r.props.checked === true)}
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
  bookTheme: string | undefined
  ready: boolean
  onSubmit: (props: ListProps) => boolean // 決められたか
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
  const [confirming, setConfirming] = useState(false)
  const [refused, setRefused] = useState(false)
  const swatches = useSwatches(theme || bookTheme)
  const changed =
    theme !== (start.theme ?? "") || color !== start.color || checklist !== start.checklist || zebra !== start.zebra
  useEffect(() => {
    onPreview?.(changed ? { theme: theme || undefined, color, checklist, zebra } : null)
  }, [changed, theme, color, checklist, zebra, onPreview])
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
          setRefused(!onSubmit({ caption, checklist, zebra, ...(theme ? { theme } : {}), ...(color ? { color } : {}) }))
        }
      >
        <Field label={t("Caption")}>
          {id => <input id={id} className={controlClass} value={caption} onChange={e => setCaption(e.target.value)} />}
        </Field>
        <Field label={t("Theme")}>
          {id => (
            <select id={id} className={controlClass} value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="">{t("Book's theme")}</option>
              {[...registry.themes.values()].map(th => (
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
        <div className={rowClass}>
          <span>{t("Alternating row colors")}</span>
          <Switch label={t("Alternating row colors")} checked={zebra} onChange={setZebra} />
        </div>
        {refused && <Problem>{t("Does not fit on the paper")}</Problem>}
      </Form>
    </Dialog>
  )
}
