// 形の色（color）を塗る CSS 変数: 形の塗りと文字のテーマキー（--shape-fill・--shape-text）を上書きする。線はテーマのまま。
// 代表色の名前は、ブックのテーマの代表色のテーマキー（palette.<役割>）とその上の文字の色を指す。
// #rrggbb はその色で塗り、暗い色なら文字を白にする
import { isLight, isPaletteName, themeVar } from "../../../plugin-api"

export function paintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  if (isPaletteName(color))
    return {
      "--shape-fill": themeVar(`palette.${color}`),
      "--shape-text": themeVar(`palette.${color}.ink`),
    }
  return { "--shape-fill": color, ...(isLight(color) ? {} : { "--shape-text": "#ffffff" }) }
}
