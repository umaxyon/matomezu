// テーマの値を決める: 宣言された欄（TokenDecl）ごとに、テーマの上書き → 宣言の既定（共通の欄）の順で値を選び、明暗ごとの色にする

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

export function resolveTokens(reg: Registry, themeId: string, decls: readonly TokenDecl[]): Record<string, Shades> {
  const theme = reg.themes.get(themeId)
  if (!theme) return fail("E102", { id: themeId })
  const values: Record<string, Shades> = {}
  for (const [id, v] of Object.entries(theme.base)) values[id] = shades(v)
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
