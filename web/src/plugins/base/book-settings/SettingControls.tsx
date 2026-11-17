// 設定の項目のコンポーネントの並び: ページの設定ならページのタイプが選んだ項目、ブックの設定ならブックが持つ項目（印刷プレビューのほかの組）ごとに、項目のビューのコンポーネントを出す（ビューの無い項目は出さない）。
// 変えた項目だけを、項目の id ごとの値（消すなら null）にして、アクション book-update・page-update の settings に渡す
import { useState } from "react"
import { withSettings } from "../../../core/book"
import type { Book, Page } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { bookSettingDefs, ownSettings, settingDefs } from "."

// 変えた項目（項目の id → 値。消すなら null）
export type SettingsPatch = Readonly<Record<string, unknown>>

// of はブックの項目かページの項目か（ページなら page が変えるページ）。only を渡せば、その id の項目だけを並べる
export function useSettingControls(
  book: Book | undefined,
  of: "book" | "page",
  page: Page | null,
  only?: readonly string[],
) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const [patch, setPatch] = useState<SettingsPatch>({})
  const defs = (
    of === "page" ? (page ? settingDefs(catalog, page.type) : []) : book ? bookSettingDefs(catalog) : []
  ).filter(d => !only || only.includes(d.id))
  const at = of === "page" ? page : book
  const draftBook = book && of === "book" ? withSettings<Book>(book, patch) : book // 変えている項目を重ねたブック
  const draftPage = page && of === "page" ? withSettings<Page>(page, patch) : null // 変えている項目を重ねたページ
  const controls = defs.flatMap(def => {
    const view = ui.settingViews.get(def.id)
    if (!view || !book || !draftBook) return []
    const own = ownSettings(at ?? null)[def.id]
    const value = def.id in patch ? (patch[def.id] ?? undefined) : own
    const Control = view.control
    return [
      <Control
        key={def.id}
        of={of}
        label={t(def.title)}
        value={value}
        inherited={def.default}
        book={draftBook}
        page={draftPage}
        onChange={(v: unknown) => setPatch(p => ({ ...p, [def.id]: v === undefined ? null : v }))}
      />,
    ]
  })
  return { controls, patch }
}
