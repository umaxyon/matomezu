// リストの色（color）を塗る CSS 変数: 台紙と見出しをその色にし（--list-mount）、その上の文字（見出し・「＋」）を色に合わせる（--list-ink）。色の塗りと文字の色は base の colorPaint。
// 行のカードはテーマの地のまま（台紙とカードの差で行を見分けられるように）
import { colorPaint } from "../../base"

export function listPaintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  const { fill, ink } = colorPaint(color)
  return { "--list-mount": fill, ...(ink ? { "--list-ink": ink } : {}) }
}
