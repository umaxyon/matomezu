// テーマの値を決める: 宣言された欄（TokenDecl）ごとに、テーマの上書き → 宣言の既定（共通の欄）の順で値を選び、明暗ごとの色にする。
// 代表色は欄 palette.<役割> と、その上に置く文字の色 palette.<役割>.ink（明るい色ならテーマの文字の色、暗い色なら白）

import { isLight, PALETTE } from "./color"
import type { ThemeValue, TokenDecl } from "./def/theme"
import { fail } from "./errors"
import { bookType, type Registry } from "./registry"
import type { Book } from "./schema/book"

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

export function resolveTokens(reg: Registry, themeId: string, decls: readonly TokenDecl[]): Record<string, Shades> {
  const theme = reg.themes.get(themeId)
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
  for (const d of decls)
    values[d.id] = shades(theme.tokens?.[d.id] ?? ("fallback" in d ? theme.base[d.fallback] : d.value))
  return values
}

// ブックを描くのに使うテーマの値（ブックのタイプと、そのブックで使えるアイテムの欄）
export function bookTokens(reg: Registry, book: Book): Record<string, Shades> {
  const type = bookType(reg, book.type)
  const items = type.items.defaults.flatMap(id => reg.items.get(id)?.tokens ?? [])
  return resolveTokens(reg, type.theme, [...type.tokens, ...items])
}
