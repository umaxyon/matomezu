// 図面の設定のダイアログ: ブックのテーマと紙の色。見出しの行の右にキャンセルと確定のボタン。
// テーマは表のテーマから選ぶ（ブックのタイプのテーマを選べば、ブックのテーマの項目を消す）。紙の色は色を選ぶポップアップで、背景の見本か好きな色を選ぶ（「なし」はテーマの紙の色）。
// 選んだそばからブックに重ねて見せる（ダイアログの下書き。中の箱もそのテーマで描く）。確定でアクション book.update を書き、キャンセルでは元のまま
import { useEffect, useId, useMemo, useState } from "react"
import { bookType } from "../../../../core/registry"
import { type BookLook, bookTheme, bookTokens } from "../../../../core/theme"
import { useT } from "../../../../ui/i18n"
import type { DialogProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry } from "../../../../ui/store-context"
import { ActionButton, ColorPicker, controlClass, Dialog, Field, Form, rowClass } from "../../../base/ui"

// 紙の色の見本（白・淡い灰・淡い黄・淡い緑・淡い青・濃い灰・濃い紺・濃い茶）
const PAPER_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"]

export function SettingsDialog({ stage, onClose }: DialogProps) {
  const t = useT()
  const form = useId()
  const registry = useRegistry()
  const book = useApp(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const { perform, previewDialog } = useActions()
  const startTheme = book ? bookTheme(registry, book) : ""
  const startPaper = book ? (book as BookLook).paperColor : undefined
  const [theme, setTheme] = useState(startTheme)
  const [paperColor, setPaperColor] = useState(startPaper)
  const typeTheme = book ? bookType(registry, book.type).theme : ""
  const id = book?.id
  const changed = theme !== startTheme || paperColor !== startPaper
  useEffect(() => {
    previewDialog(changed && id ? { book: id, props: { theme, paperColor } } : null)
  }, [changed, id, theme, paperColor, previewDialog])
  // 「なし」のときの紙の色: 選んでいるテーマの紙の色
  const none = useMemo(
    () =>
      book
        ? (bookTokens(registry, { ...book, theme, paperColor: undefined } as typeof book).paper?.light ?? "#ffffff")
        : "#ffffff",
    [registry, book, theme],
  )
  if (!book) return null
  const swatches = PAPER_PRESETS.map(hex => ({ name: hex, hex, label: hex }))
  const submit = () => {
    const done = perform(
      "book.update",
      { theme: theme === typeTheme ? null : theme, paperColor: paperColor ?? null },
      { book: book.id },
    )
    if (done.ok) onClose()
  }
  return (
    <Dialog
      title={t("Settings")}
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary>
            {t("OK")}
          </ActionButton>
        </>
      }
    >
      <Form id={form} ready onSubmit={submit}>
        <Field label={t("Theme")}>
          {fid => (
            <select id={fid} className={controlClass} value={theme} onChange={e => setTheme(e.target.value)}>
              {[...registry.themes.values()].map(th => (
                <option key={th.id} value={th.id}>
                  {t(th.title)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className={rowClass}>
          <span>{t("Paper color")}</span>
          <ColorPicker
            label={t("Paper color")}
            value={paperColor}
            palette={swatches}
            none={none}
            onChange={setPaperColor}
          />
        </div>
      </Form>
    </Dialog>
  )
}
