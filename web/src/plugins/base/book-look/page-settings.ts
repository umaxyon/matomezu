// ページの設定の項目を当てる（page-update と pages-update が使う）
import { withSettings } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ItemPage } from "../../../core/placed"
import { settingsPatchOf } from "../book-settings"
import { PAGE_PAPER_COLOR } from "./look"

// ページ page に、ページの設定の項目 settings（そのタイプが選んだ項目だけ。null は消す）を当てたページ。形に合わない・選んでいない項目があれば null。紙の色は小文字にそろえる
export function withPageSettings(catalog: CoreCatalog, page: ItemPage, settings: unknown): ItemPage | null {
  const patch = settingsPatchOf(catalog, page.type)?.safeParse(settings)
  if (!patch?.success) return null
  const values = { ...(patch.data as Record<string, unknown>) }
  const paper = values[PAGE_PAPER_COLOR.id]
  if (typeof paper === "string") values[PAGE_PAPER_COLOR.id] = paper.toLowerCase()
  return withSettings(page, values)
}
