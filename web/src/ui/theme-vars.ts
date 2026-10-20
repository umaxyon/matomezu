// テーマの値（core/theme.ts）を CSS 変数にする。欄の id の「.」は「-」にし、頭に --theme- を付ける（例: box.fill → --theme-box-fill）
import type { CSSProperties } from "react"

export function themeVars(tokens: Readonly<Record<string, string>>): CSSProperties {
  return Object.fromEntries(
    Object.entries(tokens).map(([id, value]) => [`--theme-${id.replaceAll(".", "-")}`, value]),
  ) as CSSProperties
}
