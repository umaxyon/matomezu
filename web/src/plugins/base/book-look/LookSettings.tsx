// テーマと紙の色の設定のコンポーネント（設定の項目 book-theme・book-paper-color のビュー）。
// テーマは表のテーマから選ぶ（ブックのタイプのテーマを選べば値を消す）。紙の色は色を選ぶポップアップで、背景の見本か好きな色を選ぶ（「なし」はテーマの紙の色）
import { useMemo } from "react"
import { bookType } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import type { SettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { ColorPicker } from "../dialog-host/ColorPicker"
import { controlClass, Field, rowClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { BOOK_PAPER_COLOR, bookTokens } from "./look"

// 紙の色の見本（白・淡い灰・淡い黄・淡い緑・淡い青・濃い灰・濃い紺・濃い茶）
const PAPER_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"]

export function ThemeSetting({ label, value, book, onChange }: SettingControlProps<string>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const typeTheme = bookType(catalog, book.type).theme
  return (
    <Field label={label}>
      {id => (
        <select
          id={id}
          className={controlClass}
          value={value !== undefined && catalog.themes.has(value) ? value : typeTheme}
          onChange={e => onChange(e.target.value === typeTheme ? undefined : e.target.value)}
        >
          {[...catalog.themes.values()].map(th => (
            <option key={th.id} value={th.id}>
              {t(th.title)}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function PaperColorSetting({ label, value, book, onChange }: SettingControlProps<string>) {
  const catalog = useCatalog().core
  // 「なし」のときの紙の色: 選んでいるテーマの紙の色
  const none = useMemo(() => {
    const settings = { ...(book as { settings?: Record<string, unknown> }).settings }
    delete settings[BOOK_PAPER_COLOR.id]
    return bookTokens(catalog, { ...book, settings } as Book).paper?.light ?? "#ffffff"
  }, [catalog, book])
  const swatches = PAPER_PRESETS.map(hex => ({ name: hex, hex, label: hex }))
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <ColorPicker label={label} value={value} palette={swatches} none={none} onChange={onChange} />
    </div>
  )
}
