// リストの色（color）を塗る CSS 変数: 台紙と見出しをその色にし（--list-mount）、その上の文字（見出し・「＋」）を色に合わせる（--list-ink）。
// 行のカードはテーマの地のまま（台紙とカードの差で行を見分けられるように）。
// 代表色の名前は、リストかブックのテーマの代表色の変数とその上の文字の色を指す。#rrggbb はその色で、暗い色なら文字を白にする
import { isLight, isPaletteName } from "../../../core/color"

export function listPaintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  if (isPaletteName(color))
    return { "--list-mount": `var(--theme-palette-${color})`, "--list-ink": `var(--theme-palette-${color}-ink)` }
  return { "--list-mount": color, ...(isLight(color) ? {} : { "--list-ink": "#ffffff" }) }
}
