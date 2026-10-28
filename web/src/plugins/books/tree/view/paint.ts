// 節の色（color）を塗る CSS 変数: 節の塗りと文字のテーマキー（--tree-node-fill・--tree-node-text）を上書きする。枠線はテーマのまま。
// 代表色の名前は、ブックのテーマの代表色のテーマキー（palette.<役割>）とその上の文字の色を指す（テーマを変えれば色も変わる）。
// #rrggbb はその色で塗り、暗い色なら文字を白にする（明るい色ならテーマの文字の色のまま）
import { isLight, isPaletteName, themeVar } from "../../../../plugin-api"

export function nodePaint(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  if (isPaletteName(color))
    return {
      "--tree-node-fill": themeVar(`palette.${color}`),
      "--tree-node-text": themeVar(`palette.${color}.ink`),
    }
  return { "--tree-node-fill": color, ...(isLight(color) ? {} : { "--tree-node-text": "#ffffff" }) }
}
