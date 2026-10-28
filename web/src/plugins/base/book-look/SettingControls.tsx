// 設定の項目のコンポーネントの並び: ブックのタイプが選んだ設定の項目（ブックかページ）ごとに、項目のビューのコンポーネントを出す（ビューの無い項目は出さない）。
// 変えた項目だけを、項目の id ごとの値（消すなら null）にして、アクション book-update・page-update の settings に渡す
import { useState } from "react"
import { withSettings } from "../../../core/book"
import type { Book } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { type SettingsOf, settingDefs, settingValue } from "../book-settings"
import { kit } from "../kit"

// 変えた項目（項目の id → 値。消すなら null）
export type SettingsPatch = Readonly<Record<string, unknown>>

export function useSettingControls(book: Book | undefined, of: SettingsOf, page: object | null) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const [patch, setPatch] = useState<SettingsPatch>({})
  const defs = book ? settingDefs(catalog, book.type, of) : []
  const at = of === "page" ? page : book
  const draft = book && of === "book" ? withSettings<Book>(book, patch) : book // 変えている項目を重ねたブック
  const controls = defs.flatMap(def => {
    const view = ui.settingViews.get(def.id)
    if (!view || !book || !draft) return []
    const own = (at as { settings?: Record<string, unknown> } | null | undefined)?.settings?.[def.id]
    const value = def.id in patch ? (patch[def.id] ?? undefined) : own
    const inherited = of === "page" ? settingValue(catalog, book, null, def.id) : def.default
    const Control = view.control
    return [
      <Control
        key={def.id}
        of={of}
        label={t(def.title)}
        value={value}
        inherited={inherited}
        book={draft}
        onChange={(v: unknown) => setPatch(p => ({ ...p, [def.id]: v === undefined ? null : v }))}
      />,
    ]
  })
  return { controls, patch }
}
