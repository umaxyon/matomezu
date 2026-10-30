// 文字の色の値: 文字の色の定義の色を、ブックのテーマの textColors で変え、ブックの設定の項目 book-text-colors（文字の色の id → #rrggbb）で上書きし、
// 利用者の上書き（利用者の設定の項目 text-colors）をさらに重ねる。ブックのタイプが settings.book に選んだブックだけが上書きを持てる（選ばなければテーマか定義の色）
import { z } from "zod"
import { HEX } from "../../../core/color"
import type { CatalogCheck, CoreCatalog } from "../../../core/core-catalog"
import { problem } from "../../../core/errors"
import type { Book } from "../../../core/schema/book"
import { bookTheme } from "../book-look"
import { settingValue } from "../book-settings"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface ThemeExtras {
    // そのテーマのブックの文字の色（文字の色の id → #rrggbb）。無い色の id は使わない
    textColors?: Readonly<Record<string, string>>
  }
}

// テーマの textColors の色が #rrggbb か（組み立てのときの確かめ）
export const THEME_TEXT_COLORS_CHECK: CatalogCheck = catalog =>
  [...catalog.themes.values()].flatMap(t =>
    Object.entries(t.textColors ?? {})
      .filter(([, color]) => !HEX.test(color))
      .map(([textColor, color]) => problem("E038", { id: t.id, textColor, color })),
  )

// ブックの文字の色の上書き（無い色の id は使わずに残す）
export const BOOK_TEXT_COLORS = kit.defineSetting({
  id: "book-text-colors",
  title: "Text colors",
  schema: z.record(z.string(), z.string().regex(HEX)),
})

// 利用者の文字の色の上書き（利用者の設定の項目。無い色の id は使わずに残す）
export const USER_TEXT_COLORS = kit.defineSetting({
  id: "text-colors",
  title: "Text colors",
  schema: z.record(z.string(), z.string().regex(HEX)),
  default: {},
})

// 利用者の上書き own の、文字の色 id を color にした値（null は上書きを消す）。項目の値は丸ごと置き換わるので、ほかの色の上書きも残す
export function withTextColor(own: TextColorValues, id: string, color: string | null): TextColorValues {
  const { [id]: _, ...rest } = own
  return color === null ? rest : { ...rest, [id]: color }
}

// 文字の色の値を置く CSS 変数の名前（ステージがブックの要素に置く。id の英数字と - のほかは _ と 16 進にする）
export const textColorVarName = (id: string) =>
  `--text-color-${id.replace(/[^a-z0-9-]/g, c => `_${c.charCodeAt(0).toString(16).padStart(2, "0")}`)}`

// 文字の色の値を、ブックの要素に置く CSS 変数にする
export function textColorVars(colors: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries([...colors].map(([id, hex]) => [textColorVarName(id), hex]))
}

export type TextColorValues = Readonly<Record<string, string>>

// 文字の色の id → 色: 定義の色 ← テーマ ← ブックの上書き ← 利用者の上書き viewer
export function textColorsOf(
  catalog: CoreCatalog,
  book: Book,
  viewer: TextColorValues = {},
): ReadonlyMap<string, string> {
  const own = (settingValue(catalog, book, null, BOOK_TEXT_COLORS.id) ?? {}) as TextColorValues
  const theme = catalog.themes.get(bookTheme(catalog, book))?.textColors ?? {}
  return new Map(
    [...catalog.textColors.values()].map(c => [c.id, viewer[c.id] ?? own[c.id] ?? theme[c.id] ?? c.color] as const),
  )
}
