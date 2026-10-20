// テーマの値を決める: 宣言された欄（TokenDecl）ごとに、テーマの上書き → 宣言の既定（共通の欄）の順で値を選ぶ

import type { TokenDecl } from "./def/theme"
import { fail } from "./errors"
import { bookType, type Registry } from "./registry"
import type { Book } from "./schema/book"

export function resolveTokens(reg: Registry, themeId: string, decls: readonly TokenDecl[]): Record<string, string> {
  const theme = reg.themes.get(themeId)
  if (!theme) return fail("E102", { id: themeId })
  const values: Record<string, string> = { ...theme.base }
  for (const d of decls) values[d.id] = theme.tokens?.[d.id] ?? theme.base[d.fallback]
  return values
}

// ブックを描くのに使うテーマの値（ブックのタイプと、そのブックで使えるアイテムの欄）
export function bookTokens(reg: Registry, book: Book): Record<string, string> {
  const type = bookType(reg, book.type)
  const items = type.items.defaults.flatMap(id => reg.items.get(id)?.tokens ?? [])
  return resolveTokens(reg, type.theme, [...type.tokens, ...items])
}
