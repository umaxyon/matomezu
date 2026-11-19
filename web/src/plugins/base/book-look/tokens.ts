// テーマの値を決める: 宣言されたテーマキー（TokenDef）ごとに、テーマの上書き → 宣言のテーマごとの値 → 宣言の既定（共通のテーマキー）の順で値を選び、明暗ごとの色にする。
// 代表色はテーマキー palette.<役割> と、その上に置く文字の色 palette.<役割>.ink（明るい色ならテーマの文字の色、暗い色なら白）。
// テーマに書かれた値の引き方（writtenValues）は、台帳アセンブルの確かめと同じ読み方にするため core にある。ページのテーマと紙の色から、ページを描く値を決めるのは look.ts
import { isLight, PALETTE } from "../../../core/color"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ThemeDef, ThemeValue, TokenDef } from "../../../core/def/theme"
import { fail } from "../../../core/errors"
import { type Shades, writtenValues } from "../../../core/theme"

export function shades(value: ThemeValue): Shades {
  if (typeof value === "string") return { light: value, dark: value }
  const one = value.light ?? value.dark ?? ""
  return { light: value.light ?? one, dark: value.dark ?? one }
}

const WHITE = "#ffffff"

// テーマ theme でのテーマキー def の値: テーマの上書き、宣言のテーマごとの値、既定の順
const tokenValue = (theme: ThemeDef, def: TokenDef): ThemeValue =>
  writtenValues(theme, def)[0]?.value ?? ("fallback" in def ? theme.base[def.fallback] : def.value)

// テーマ themeId の、共通のテーマキー・代表色と、テーマキー defs の値（テーマキーの id → 明暗ごとの色）
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
