// 絵の色（color）を塗る CSS 変数: 絵の色のテーマキー（--art-fill）を、色の塗り（base の colorPaint）で上書きする。明るい所・暗い所はビューの CSS がこの色から作る
import { colorPaint } from "../../base"

export function paintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  return { "--art-fill": colorPaint(color).fill }
}
