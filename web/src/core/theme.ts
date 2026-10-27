// テーマの値を決める: 宣言されたテーマキー（TokenDef）ごとに、テーマの上書き → 宣言の既定（共通のテーマキー）の順で値を選び、明暗ごとの色にする。
// 代表色はテーマキー palette.<役割> と、その上に置く文字の色 palette.<役割>.ink（明るい色ならテーマの文字の色、暗い色なら白）。
// ブックのテーマと紙の色（base の設定の項目）から、ブックを描く値を決めるのは base（plugins/base/book-look/look.ts）

import { isLight, PALETTE } from "./color"
import type { CoreCatalog } from "./core-catalog"
import type { BookTypeDef } from "./def/book-type"
import type { ThemeValue, TokenDef } from "./def/theme"
import { fail } from "./errors"
import { splitId } from "./names"

// 明暗ごとに決めた色（明暗で同じなら、どちらも同じ色）
export interface Shades {
  light: string
  dark: string
}

export function shades(value: ThemeValue): Shades {
  if (typeof value === "string") return { light: value, dark: value }
  const one = value.light ?? value.dark ?? ""
  return { light: value.light ?? one, dark: value.dark ?? one }
}

const WHITE = "#ffffff"

export function resolveTokens(
  catalog: CoreCatalog,
  themeId: string,
  defs: readonly TokenDef[],
): Record<string, Shades> {
  const theme = catalog.themes.get(themeId)
  if (!theme) return fail("E102", { id: themeId })
  const values: Record<string, Shades> = {}
  for (const [id, v] of Object.entries(theme.base)) values[id] = shades(v)
  const text = shades(theme.base.text)
  for (const name of PALETTE) {
    const color = shades(theme.palette[name])
    values[`palette.${name}`] = color
    values[`palette.${name}.ink`] = {
      light: isLight(color.light) ? text.light : WHITE,
      dark: isLight(color.dark) ? text.dark : WHITE,
    }
  }
  for (const d of defs)
    values[d.id] = shades(theme.tokens?.[d.id] ?? ("fallback" in d ? theme.base[d.fallback] : d.value))
  return values
}

// ブックのタイプ type のブックを描くのに使うテーマキーの宣言: タイプのテーマキーと、タイプが置けるアイテム（allowed）のテーマキー、
// そのアイテムの持ち主のプラグインが持つテーマキー（いくつものアイテムが共に使うもの）。同じ id は 1 つにまとめる
export function tokenDefsOf(catalog: CoreCatalog, type: BookTypeDef): TokenDef[] {
  const items = type.items.allowed.flatMap(id => catalog.items.get(id) ?? [])
  const owners = new Set(items.map(i => splitId(i.id).owner))
  const defs = [
    ...type.tokens,
    ...items.flatMap(i => i.tokens),
    ...catalog.tokens.filter(t => owners.has(splitId(t.id).owner)),
  ]
  return [...new Map(defs.map(d => [d.id, d])).values()]
}
