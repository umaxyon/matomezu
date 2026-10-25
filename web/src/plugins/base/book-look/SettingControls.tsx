// 設定の項目のコンポーネントの並び: ブックのタイプが選んだ設定の項目（ブックかページ）ごとに、項目のビューのコンポーネントを出す（ビューの無い項目は出さない）。
// 変えた項目だけを、欄の名前ごとの値（消すなら null）にして、アクション book.update・page.update の settings に渡す
import { useState } from "react"
import { type SettingsOf, settingDefs, settingValue } from "../../../core/book-settings"
import type { Book } from "../../../core/schema/book"
import { useT } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"

// 変えた項目（欄の名前 → 値。消すなら null）
export type SettingsPatch = Readonly<Record<string, unknown>>

export function useSettingControls(book: Book | undefined, of: SettingsOf, page: object | null) {
  const t = useT()
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const [patch, setPatch] = useState<SettingsPatch>({})
  const defs = book ? settingDefs(catalog, book.type, of) : []
  const at = of === "page" ? page : book
  const controls = defs.flatMap(def => {
    const view = ui.settingViews.get(def.id)
    if (!view || !book) return []
    const own = (at as Record<string, unknown> | null | undefined)?.[def.field]
    const value = def.field in patch ? (patch[def.field] ?? undefined) : own
    const inherited = of === "page" ? settingValue(catalog, book, null, def.id) : def.default
    const Control = view.control
    return [
      <Control
        key={def.id}
        of={of}
        label={t(def.title)}
        value={value}
        inherited={inherited}
        onChange={(v: unknown) => setPatch(p => ({ ...p, [def.field]: v === undefined ? null : v }))}
      />,
    ]
  })
  return { controls, patch }
}
