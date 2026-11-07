// ブックの見た目: テーマと紙の色の設定の項目（ブックのタイプが settings.book に id で選ぶ）と、ブックを描くテーマの値。
// どちらも既定を持たず、値が無ければテーマはブックのタイプのテーマ、紙の色はテーマの紙の色
import { z } from "zod"
import { HEX } from "../../../core/color"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { resolveTokens, type Shades, shades, tokenDefsOf } from "../../../core/theme"
import { settingValue } from "../book-settings"
import { kit } from "../kit"
import { themeFits, themesFor } from "./theme-types"

// ブックのテーマ（テーマの id。変えるときはブックのタイプが選べるテーマのどれかで、残っていても選べなければ使わない。theme-types.ts）
export const BOOK_THEME = kit.defineSetting({
  id: "book-theme",
  title: "Theme",
  schema: z.string().min(1),
  describe: (catalog, of) => {
    const ids = (of === "user" ? [...catalog.themes.values()] : themesFor(catalog, of.bookType)).map(t => t.id)
    return ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.never()
  },
})

// 紙の色（#rrggbb。book-update が小文字にそろえる）
export const BOOK_PAPER_COLOR = kit.defineSetting({
  id: "book-paper-color",
  title: "Paper color",
  schema: z.string().regex(HEX),
})

// ブックのテーマの id: ブックのテーマの項目（タイプが選べなければ使わない）か、ブックのタイプの既定のテーマ
export function bookTheme(catalog: CoreCatalog, book: Book): string {
  const own = settingValue(catalog, book, null, BOOK_THEME)
  return own !== undefined && themeFits(catalog, book.type, own) ? own : bookType(catalog, book.type).theme
}

// ブックを描くのに使うテーマの値（ブックのタイプのテーマキー。core の tokenDefsOf）。紙の色があれば紙のテーマキーをその色にする
export function bookTokens(catalog: CoreCatalog, book: Book): Record<string, Shades> {
  const type = bookType(catalog, book.type)
  const values = resolveTokens(catalog, bookTheme(catalog, book), tokenDefsOf(catalog, type))
  const paper = settingValue(catalog, book, null, BOOK_PAPER_COLOR)
  return paper === undefined ? values : { ...values, paper: shades(paper) }
}
