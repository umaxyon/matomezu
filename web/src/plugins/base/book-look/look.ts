// ページの見た目: テーマと紙の色の設定の項目（ページのタイプが settings に id で選ぶ）と、ページを描くテーマの値。
// どちらも既定を持たず、値が無ければテーマはページのタイプのテーマ、紙の色はテーマの紙の色
import { z } from "zod"
import { HEX } from "../../../core/color"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import { type PageTypeDef, placeableOf } from "../../../core/def/page-type"
import type { TokenDef } from "../../../core/def/theme"
import { splitId } from "../../../core/names"
import type { Page } from "../../../core/schema/book"
import type { Shades } from "../../../core/theme"
import { settingValue } from "../book-settings"
import { kit } from "../kit"
import { themeFits, themesFor } from "./theme-types"
import { resolveTokens, shades } from "./tokens"

// ページのテーマ（テーマの id。変えるときはページのタイプが使えるテーマのどれかで、残っていても使えなければ使わない。theme-types.ts）
export const PAGE_THEME = kit.defineSetting({
  id: "page-theme",
  holder: "page",
  title: "Theme",
  schema: z.string().min(1),
  describe: (catalog, of) => {
    const ids = (typeof of === "string" ? [...catalog.themes.values()] : themesFor(catalog, of.pageType)).map(t => t.id)
    return ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never()
  },
})

// 紙の色（#rrggbb。変えるアクションが小文字にそろえる）
export const PAGE_PAPER_COLOR = kit.defineSetting({
  id: "page-paper-color",
  holder: "page",
  title: "Paper color",
  schema: z.string().regex(HEX),
})

// ページのテーマの id: ページのテーマの項目（タイプが使えなければ使わない）か、ページのタイプの既定のテーマ
export function pageTheme(catalog: CoreCatalog, page: Pick<Page, "type">): string {
  const own = settingValue(catalog, page, PAGE_THEME)
  return own !== undefined && themeFits(catalog, page.type, own) ? own : pageType(catalog, page.type).theme
}

// ページを描くのに使うテーマの値（ページのタイプのテーマキー。tokenDefsOf）。紙の色があれば紙のテーマキーをその色にする
export function pageTokens(catalog: CoreCatalog, page: Pick<Page, "type">): Record<string, Shades> {
  const type = pageType(catalog, page.type)
  const values = resolveTokens(catalog, pageTheme(catalog, page), tokenDefsOf(catalog, type))
  const paper = settingValue(catalog, page, PAGE_PAPER_COLOR)
  return paper === undefined ? values : { ...values, paper: shades(paper) }
}

// ページのタイプ type のブックを描くのに使うテーマキーの宣言: タイプのテーマキーと、タイプが置けるアイテム（allowed）のテーマキー、
// そのアイテムの持ち主のプラグインが持つテーマキー（いくつものアイテムが共に使うもの）。同じ id は 1 つにまとめる
export function tokenDefsOf(catalog: CoreCatalog, type: PageTypeDef): TokenDef[] {
  const items = placeableOf(type).flatMap(id => catalog.items.get(id) ?? [])
  const owners = new Set(items.map(i => splitId(i.id).owner))
  const defs = [
    ...type.tokens,
    ...items.flatMap(i => i.tokens),
    ...[...catalog.tokens.values()].filter(t => owners.has(splitId(t.id).owner)),
  ]
  return [...new Map(defs.map(d => [d.id, d])).values()]
}
