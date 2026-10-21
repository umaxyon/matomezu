// テーマの値（core/theme.ts）を CSS 変数にする。欄の id の「.」は「-」にし、頭に --theme- を付ける（例: box.fill → --theme-box-fill）。
// 明暗で違う色は light-dark() にし、ブックの中身の明暗は見る人の OS の明暗に合わせる（color-scheme: light dark。スキンの明暗には従わない）
import type { CSSProperties } from "react"
import type { Shades } from "../core/theme"

export function themeVars(tokens: Readonly<Record<string, Shades>>): CSSProperties {
  const vars = Object.entries(tokens).map(([id, { light, dark }]) => [
    `--theme-${id.replaceAll(".", "-")}`,
    light === dark ? light : `light-dark(${light}, ${dark})`,
  ])
  return { colorScheme: "light dark", ...Object.fromEntries(vars) } as CSSProperties
}
