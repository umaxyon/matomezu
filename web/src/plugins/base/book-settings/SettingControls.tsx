// 設定の項目のコンポーネントの並び: ページの設定ならページのタイプが選んだ項目（ブックの外のページでも同じ）、ブックの設定ならブックが持つ項目（印刷プレビューのほかの組）ごとに、項目のビューのコンポーネントを出す（ビューの無い項目は出さない）。
// 変えた項目だけを、項目の id ごとの値（消すなら null）にして、アクション book-update・page-update の settings に渡す
import { useState } from "react"
import { withSettings } from "../../../core/book"
import type { Book, Page } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { outermostSettingDefs, ownSettings, settingDefs } from "."

// 変えた項目（項目の id → 値。消すなら null）
export type SettingsPatch = Readonly<Record<string, unknown>>

// 項目を持つ所: ページ（変えるページ）か、ステージエントリのブック
export type SettingsAt = { of: "page"; page: Page | null } | { of: "outermost"; book: Book | undefined }

// only を渡せば、その id の項目だけを並べる
export function useSettingControls(at: SettingsAt, only?: readonly string[]) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const [patch, setPatch] = useState<SettingsPatch>({})
  const holder = at.of === "page" ? at.page : at.book
  const all =
    at.of === "page"
      ? at.page
        ? settingDefs(catalog, at.page.type)
        : []
      : at.book
        ? outermostSettingDefs(catalog)
        : []
  const defs = all.filter(d => !only || only.includes(d.id))
  const draftPage = at.of === "page" && at.page ? withSettings<Page>(at.page, patch) : null // 変えている項目を重ねたページ
  const controls = defs.flatMap(def => {
    const view = ui.settingViews.get(def.id)
    if (!view) return []
    const own = ownSettings(holder ?? null)[def.id]
    const value = def.id in patch ? (patch[def.id] ?? undefined) : own
    const Control = view.control
    return [
      <Control
        key={def.id}
        of={at.of}
        label={t(def.title)}
        value={value}
        inherited={def.default}
        page={draftPage}
        onChange={(v: unknown) => setPatch(p => ({ ...p, [def.id]: v === undefined ? null : v }))}
      />,
    ]
  })
  return { controls, patch }
}
