// 文字の色の値: 文字の色の定義の色を、ブックの設定の項目 book-text-colors（文字の色の id → #rrggbb）で上書きし、見る人の上書き（見る人の設定の textColors。アクション settings-text-colors）をさらに重ねる。
// ブックのタイプが settings.book に選んだブックだけが上書きを持てる（選ばなければ定義の色）
import { z } from "zod"
import { HEX } from "../../../core/color"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { Book } from "../../../core/schema/book"
import { settingValue } from "../book-settings"
import { kit } from "../kit"

// ブックの文字の色の上書き（無い色の id は使わずに残す）
export const BOOK_TEXT_COLORS = kit.defineSetting({
  id: "book-text-colors",
  title: "Text colors",
  schema: z.record(z.string(), z.string().regex(HEX)),
})

// 文字の色の値を置く CSS 変数の名前（ステージがブックの要素に置く。id の英数字と - のほかは _ と 16 進にする）
export const textColorVarName = (id: string) =>
  `--text-color-${id.replace(/[^a-z0-9-]/g, c => `_${c.charCodeAt(0).toString(16).padStart(2, "0")}`)}`

// 文字の色の値を、ブックの要素に置く CSS 変数にする
export function textColorVars(colors: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries([...colors].map(([id, hex]) => [textColorVarName(id), hex]))
}

export type TextColorValues = Readonly<Record<string, string>>

// 文字の色の id → 色: 定義の色 ← ブックの上書き ← 見る人の上書き viewer
export function textColorsOf(
  catalog: CoreCatalog,
  book: Book,
  viewer: TextColorValues = {},
): ReadonlyMap<string, string> {
  const own = (settingValue(catalog, book, null, BOOK_TEXT_COLORS.id) ?? {}) as TextColorValues
  return new Map([...catalog.textColors.values()].map(c => [c.id, viewer[c.id] ?? own[c.id] ?? c.color] as const))
}
