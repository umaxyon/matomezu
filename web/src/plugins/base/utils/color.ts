// 物に付ける色の書き方: テーマの代表色の名前か、じかの色（#rrggbb）。代表色はどのテーマでもそのテーマの色で描く

import { z } from "zod"
import { HEX, isLight, isPaletteName, PALETTE } from "../../../core/color"
import { themeVar } from "../../../core/def/theme"

export const ColorSchema = z.union([z.enum(PALETTE), z.string().regex(HEX)])

// 色 color で塗るときの、塗りの色と、その上の文字の色（CSS の値）。各ビューは自分のテーマキーの CSS 変数に当てる。
// 代表色の名前は、テーマの代表色のテーマキー（palette.<役割>）とその上の文字の色を指す（テーマを変えれば色も変わる）。
// #rrggbb はその色で塗り、暗い色なら文字を白にする（明るい色なら ink は無く、テーマの文字の色のまま）
export function colorPaint(color: string): { fill: string; ink?: string } {
  if (isPaletteName(color)) return { fill: themeVar(`palette.${color}`), ink: themeVar(`palette.${color}.ink`) }
  return isLight(color) ? { fill: color } : { fill: color, ink: "#ffffff" }
}
