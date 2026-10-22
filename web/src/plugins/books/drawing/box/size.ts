// 箱の大きさと中身の並び: 幅と高さは置いたアイテムの w・h（利用者が決める。本文では伸び縮みしない）。
// 上にキャプションを 1 行（隠れない。一番低い高さはキャプション 1 行ぶん）、本文があれば区切り線と、幅で折り返した本文の行を、高さに収まる数だけ出す。
// 収まらない本文は、最後に出す行の終わりに … を付けて切る。本文が 1 行も出ない高さなら、区切り線も出さない。
// 文字の幅と折り返しは core/text で計算するので、画面でも常駐でも同じ行になる。画面（BoxView）はこの値のとおりに描く
import type { z } from "zod"
import type { Size } from "../../../../core/geom"
import { clampLines, wrap } from "../../../../core/text/text"
import { captionTextWidth, PLACE_LINES, TEXT_LOOK } from "../shape"
import type { BOX } from "."

type BoxProps = z.infer<(typeof BOX)["props"]>

// 箱の見た目の寸法（px）。BoxView.module.css と同じ値にする。文字の寸法は形で共通（shape の TEXT_LOOK）
export const BOX_LOOK = { border: 1, ...TEXT_LOOK } as const

const L = BOX_LOOK
const HEAD = 2 * (L.border + L.padY) + L.line // 上下の枠と余白と、キャプション 1 行
const RULE = 2 * L.ruleGap + 1

export const BOX_SIZE: Size = { w: 64, h: 64 } // 置いたときの一番小さい大きさ（中身の無い箱の大きさ）
export const BOX_MIN: Size = { w: 64, h: HEAD } // 一番狭い幅と、一番低い高さ（キャプション 1 行）

export interface BoxLayout {
  body: string[] // 描く本文の行（本文が無いか、1 行も出ない高さなら空）
  rule: boolean // 区切り線を引くか
}

const innerWidth = (w: number) => w - 2 * (L.border + L.padX)

// 幅 w・高さ h の箱に描く本文の行と区切り線
export function boxLayout(props: BoxProps, size: Size): BoxLayout {
  if (props.body === "") return { body: [], rule: false }
  const rule = props.rule ? RULE : 0
  const fits = Math.floor((size.h - HEAD - rule) / L.line)
  if (fits <= 0) return { body: [], rule: false }
  const inner = innerWidth(size.w)
  return { body: clampLines(wrap(props.body, inner, L.body), fits, inner, L.body), rule: props.rule }
}

// 置いたときの幅: キャプションが PLACE_CAPTION 字まで切れずに見える幅（超えるなら、その字数と … が見える幅。一番狭くて BOX_SIZE の幅）
export function placedWidth(props: BoxProps): number {
  return Math.max(BOX_SIZE.w, captionTextWidth(props.caption) + 2 * (L.border + L.padX))
}

// 置いたときの高さ: 本文が PLACE_LINES 行まで見える高さ（一番低くて BOX_SIZE の高さ）
export function placedHeight(props: BoxProps, w: number): number {
  if (props.body === "") return BOX_SIZE.h
  const lines = Math.min(wrap(props.body, innerWidth(w), L.body).length, PLACE_LINES)
  return Math.max(BOX_SIZE.h, HEAD + (props.rule ? RULE : 0) + lines * L.line)
}
