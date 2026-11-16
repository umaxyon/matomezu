// テーマの値を決める: 宣言されたテーマキー（TokenDef）ごとに、テーマの上書き → 宣言のテーマごとの値 → 宣言の既定（共通のテーマキー）の順で値を選び、明暗ごとの色にする。
// 代表色はテーマキー palette.<役割> と、その上に置く文字の色 palette.<役割>.ink（明るい色ならテーマの文字の色、暗い色なら白）。
// ブックのテーマと紙の色（base の設定の項目）から、ブックを描く値を決めるのは base（plugins/base/book-look/look.ts）

import { isLight, PALETTE } from "./color"
import type { CoreCatalog } from "./core-catalog"
import { type PageTypeDef, placeableOf } from "./def/page-type"
import type { ThemeDef, ThemeValue, TokenDef } from "./def/theme"
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

// テーマ theme でテーマキー def に書かれた値（引く順: テーマの上書き、宣言のテーマごとの値）。どちらも無ければ空。
// by は書いた者: テーマの上書きはテーマのプラグイン、宣言のテーマごとの値はテーマキーを宣言したプラグイン（値の誤りの warning はその者のもの）
export const writtenValues = (theme: ThemeDef, def: TokenDef): { value: ThemeValue; by: string }[] => {
  const own = theme.tokens?.[def.id]
  const declared = (def.themeValues as Readonly<Record<string, ThemeValue>> | undefined)?.[theme.id]
  return [
    ...(own === undefined ? [] : [{ value: own, by: splitId(theme.id).owner ?? "" }]),
    ...(declared === undefined ? [] : [{ value: declared, by: splitId(def.id).owner ?? "" }]),
  ]
}

// テーマ theme でのテーマキー def の値: テーマの上書き、宣言のテーマごとの値、既定の順
export const tokenValue = (theme: ThemeDef, def: TokenDef): ThemeValue =>
  writtenValues(theme, def)[0]?.value ?? ("fallback" in def ? theme.base[def.fallback] : def.value)

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
  for (const d of defs) values[d.id] = shades(tokenValue(theme, d))
  return values
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
