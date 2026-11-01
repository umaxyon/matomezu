// 節の色（color）を塗る CSS 変数: 節の塗りと文字のテーマキー（--tree-node-fill・--tree-node-text）を、色の塗りと文字の色（base の colorPaint）で上書きする。枠線はテーマのまま。
// 節の形が下線のときは、塗らずに下線をその色にする（--underline-color）
import { colorPaint } from "../../../base"

export function nodePaint(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  const { fill, ink } = colorPaint(color)
  return { "--tree-node-fill": fill, "--underline-color": fill, ...(ink ? { "--tree-node-text": ink } : {}) }
}
