// 箱の色（color）を塗る CSS 変数: 箱の塗りと文字の欄（--theme-box-fill・--theme-box-text）を上書きする。線はテーマのまま。
// 代表色の名前は、箱かブックのテーマの代表色の変数（--theme-palette-<役割>）とその上の文字の色を指す（テーマを変えれば色も変わる）。
// #rrggbb はその色で塗り、暗い色なら文字を白にする（明るい色ならテーマの文字の色のまま）
import { isLight, isPaletteName } from "../../../core/color"

export function paintVars(color: string | undefined): Record<string, string> | undefined {
  if (color === undefined) return undefined
  if (isPaletteName(color))
    return {
      "--theme-box-fill": `var(--theme-palette-${color})`,
      "--theme-box-text": `var(--theme-palette-${color}-ink)`,
    }
  return { "--theme-box-fill": color, ...(isLight(color) ? {} : { "--theme-box-text": "#ffffff" }) }
}
