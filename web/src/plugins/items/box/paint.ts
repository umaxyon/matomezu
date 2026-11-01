// 箱の色（color）を塗る CSS 変数: 箱の塗りと文字のテーマキー（--box-fill・--box-text）を、色の塗りと文字の色（base の colorPaint）で上書きする。線はテーマのまま
import { colorPaint } from "../../base"

export function paintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  const { fill, ink } = colorPaint(color)
  return { "--box-fill": fill, ...(ink ? { "--box-text": ink } : {}) }
}
