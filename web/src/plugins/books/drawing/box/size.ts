// 箱の大きさと中身の並び: 幅は置いたアイテムの w（無ければ定義の幅）、高さは中身から決める（一番低くて定義の高さ）。
// 上にキャプションを 1 行、本文があれば区切り線と、幅で折り返した本文の行（最大の行数を超えた分は … で切る）。
// 文字の幅と折り返しは core/text で計算するので、画面でも常駐でも同じ高さになる。画面（BoxView）はこの値のとおりに描く
import type { z } from "zod"
import type { Size } from "../../../../core/geom"
import { clampLines, type Font, wrap } from "../../../../core/text/text"
import type { BOX } from "."

type BoxProps = z.infer<(typeof BOX)["props"]>

// 箱の見た目の寸法（px）。BoxView.module.css と同じ値にする
export const BOX_LOOK = {
  border: 1,
  padX: 8,
  padY: 4,
  line: 18, // 1 行の高さ
  ruleGap: 3, // 区切り線の上下の間（線は 1px）
  caption: { size: 13, weight: 700 } satisfies Font,
  body: { size: 13, weight: 400 } satisfies Font,
} as const

export const BOX_SIZE: Size = { w: 160, h: 64 } // 幅の既定と、一番低い高さ
export const BOX_MIN_W = 80 // 一番狭い幅

export interface BoxLayout {
  size: Size
  body: string[] // 描く本文の行（本文が無ければ空）
  clipped: boolean // 本文を最大の行数で切ったか
}

// 幅 w の箱の大きさと、描く本文の行
export function boxLayout(props: BoxProps, w: number): BoxLayout {
  const L = BOX_LOOK
  const inner = w - 2 * (L.border + L.padX)
  if (props.body === "") return { size: { w, h: BOX_SIZE.h }, body: [], clipped: false }
  const all = wrap(props.body, inner, L.body)
  const body = props.bodyLines === undefined ? all : clampLines(all, props.bodyLines, inner, L.body)
  const rule = props.rule ? 2 * L.ruleGap + 1 : 0
  const h = 2 * (L.border + L.padY) + L.line + rule + body.length * L.line
  return { size: { w, h: Math.max(BOX_SIZE.h, h) }, body, clipped: body.length < all.length }
}
