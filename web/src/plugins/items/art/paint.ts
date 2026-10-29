// 絵の色（color）を塗る CSS 変数: 絵の色のテーマキー（--art-fill）を上書きする。明るい所・暗い所はビューの CSS がこの色から作る。
// 代表色の名前は、ブックのテーマの代表色のテーマキー（palette.<役割>）を指し、#rrggbb はその色で塗る
import { isPaletteName, themeVar } from "../../../plugin-api"

export function paintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  return { "--art-fill": isPaletteName(color) ? themeVar(`palette.${color}`) : color }
}
