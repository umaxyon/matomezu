// 設定の項目のコンポーネントの並び: ページの設定ならページのタイプが選んだ項目（ブックの外のページでも同じ）、ブックの設定ならブックが持つ項目（印刷プレビューのほかの組）ごとに、項目のビューのコンポーネントを出す（ビューの無い項目は出さない）。
// 変えた項目だけを、項目の id ごとの値（消すなら null）にして、アクション book-update・page-update の settings に渡す

import { useState } from "react"
import { withSettings } from "../../../core/book"
import { NOT_SET } from "../../../core/def/setting"
import type { Book, Page } from "../../../core/schema/book"
import { NO_PAGE } from "../../../core/stage"
import { NO_BOOK } from "../../../store/commands/def"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { helpOf } from "../settings/SettingRow"
import { outermostSettingDefs, ownSettings, settingDefs } from "."

// 変えた項目（項目の id → 値。消すなら null）
export type SettingsPatch = Readonly<Record<string, unknown>>

// 項目を持つ所: ページ（変えるページ。無ければ NO_PAGE）か、ステージエントリのブック（無ければ NO_BOOK）
export type SettingsAt = { of: "page"; page: Page | typeof NO_PAGE } | { of: "outermost"; book: Book | typeof NO_BOOK }

// only を渡せば、その id の項目だけを並べる
export function useSettingControls(at: SettingsAt, only?: readonly string[]) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const [patch, setPatch] = useState<SettingsPatch>({})
  const holder = at.of === "page" ? (at.page === NO_PAGE ? null : at.page) : at.book === NO_BOOK ? null : at.book
  const all =
    at.of === "page"
      ? at.page !== NO_PAGE
        ? settingDefs(catalog, at.page.type)
        : []
      : at.book !== NO_BOOK
        ? outermostSettingDefs(catalog)
        : []
  const defs = all.filter(d => !only || only.includes(d.id))
  const draftPage = at.of === "page" && at.page !== NO_PAGE ? withSettings<Page>(at.page, patch) : NO_PAGE // 変えている項目を重ねたページ
  const controls = defs.flatMap(def => {
    const view = ui.settingViews.get(def.id)
    if (!view) return []
    const own = ownSettings(holder)[def.id]
    const value = def.id in patch ? (patch[def.id] ?? NOT_SET) : (own ?? NOT_SET)
    const Control = view.control
    return [
      <Control
        key={def.id}
        of={at.of}
        label={t(def.title)}
        help={helpOf(def, t)}
        value={value}
        inherited={def.default ?? NOT_SET}
        page={draftPage}
        onChange={(v: unknown) => setPatch(p => ({ ...p, [def.id]: v }))}
        onReset={() => setPatch(p => ({ ...p, [def.id]: null }))}
      />,
    ]
  })
  return { controls, patch }
}
