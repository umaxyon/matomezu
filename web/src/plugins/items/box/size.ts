// 箱の大きさと中身の並び: 幅と高さは置いたアイテムの w・h（利用者が決める。本文では伸び縮みしない）。
// 上にキャプションを 1 行（隠れない。一番低い高さはキャプション 1 行ぶん）、本文があれば区切り線と、本文の列の幅で折り返した本文の行を、高さに収まる数だけ出す。
// 本文の列は、本文の幅（bodyWidth）を書いていればその幅（キャプションの幅より狭くはしない。箱の中より広ければ箱の中いっぱい）で、置き場所はキャプションの寄せに倣う。
// 収まらない本文は、最後に出す行の終わりに … を付けて切る。本文が 1 行も出ない高さなら、区切り線も出さない。
// キャプション・区切り線・本文の塊の計算は base の文字の塊（textBlock）で、箱は枠と余白の内側の大きさを渡す。
// 文字の幅と折り返しは base の text で計算するので、画面でも常駐でも同じ行になる。画面（BoxView）はこの値のとおりに描く
import type { z } from "zod"
import type { Size } from "../../../plugin-api"
import {
  type BodyColumn,
  bodyColumn as baseBodyColumn,
  bodyMinWidth as baseBodyMinWidth,
  bodyWidthAfter as baseBodyWidthAfter,
  captionTextWidth,
  PLACE_LINES,
  type RichLine,
  TEXT_LOOK,
  textBlock,
  textBlockHeight,
  wrapRich,
} from "../../base"
import type { BoxPropsSchema } from "./box"

type BoxProps = z.infer<typeof BoxPropsSchema>

// キャプション・区切り線・本文の塊を置く縦の位置
export const VALIGNS = ["top", "middle", "bottom"] as const
export type VAlign = (typeof VALIGNS)[number]

// 描く縦の位置: 書いていなければ自動（本文も子も無ければ真ん中、あれば上）。子がある間は真ん中を上として描く（子の領域に重ねない）
export function vAlignOf(props: Pick<BoxProps, "vAlign" | "body">, hasChildren: boolean): VAlign {
  const v = props.vAlign ?? (props.body === "" && !hasChildren ? "middle" : "top")
  return hasChildren && v === "middle" ? "top" : v
}

// 箱の見た目の寸法（px）。BoxView.module.css と同じ値にする。文字の寸法は形で共通（shape の TEXT_LOOK）
export const BOX_LOOK = { border: 1, ...TEXT_LOOK } as const

const L = BOX_LOOK
const HEAD = 2 * (L.border + L.padY) + L.line // 上下の枠と余白と、キャプション 1 行
const RULE = 2 * L.ruleGap + 1

export const BOX_SIZE: Size = { w: 64, h: 64 } // 置いたときの一番小さい大きさ（中身の無い箱の大きさ）
export const BOX_MIN: Size = { w: 64, h: HEAD } // 一番狭い幅と、一番低い高さ（キャプション 1 行）

export interface BoxLayout {
  body: RichLine[] // 描く本文の行（本文が無いか、1 行も出ない高さなら空）
  rule: boolean // 区切り線を引くか
  column: BodyColumn // 本文の列
}

// 箱の中の幅（枠と左右の余白の内側）
export const innerWidth = (w: number) => w - 2 * (L.border + L.padX)
// 本文の列の一番狭い幅（一番狭い箱の中の幅）
export const BODY_LEAST = innerWidth(BOX_MIN.w)

// 本文の幅を縮められる一番狭い幅
export const bodyMinWidth = (props: BoxProps): number => baseBodyMinWidth(props, BODY_LEAST)

// 幅 w の箱の本文の列（本文の幅が無いか、箱の中より広ければ箱の中いっぱい）
export const bodyColumn = (props: BoxProps, w: number): BodyColumn => baseBodyColumn(props, innerWidth(w), BODY_LEAST)

// 本文の列の端（side）をつかんで、紙の上で dx だけ横に動かしたときの本文の幅（箱の中いっぱいになれば null）
export const bodyWidthAfter = (props: BoxProps, w: number, side: "left" | "right", dx: number): number | null =>
  baseBodyWidthAfter(props, innerWidth(w), BODY_LEAST, side, dx)

// 幅 w・高さ h の箱に描く本文の行と区切り線（上下の枠と余白の内側に、文字の塊を収める）
export function boxLayout(props: BoxProps, size: Size): BoxLayout {
  const { body, rule, column } = textBlock(props, innerWidth(size.w), BODY_LEAST, size.h - 2 * (L.border + L.padY))
  return { body, rule, column }
}

// 置いたときの幅: キャプションが PLACE_CAPTION 字まで切れずに見える幅（超えるなら、その字数と … が見える幅。一番狭くて BOX_SIZE の幅）
export function placedWidth(props: BoxProps): number {
  return Math.max(BOX_SIZE.w, captionTextWidth(props.caption) + 2 * (L.border + L.padX))
}

// 置いたときの高さ: 本文が PLACE_LINES 行まで見える高さ（一番低くて BOX_SIZE の高さ）
export function placedHeight(props: BoxProps, w: number): number {
  if (props.body === "") return BOX_SIZE.h
  const lines = Math.min(wrapRich(props.body, bodyColumn(props, w).w, L.body).length, PLACE_LINES)
  return Math.max(BOX_SIZE.h, HEAD + (props.rule ? RULE : 0) + lines * L.line)
}

// キャプションと本文を全部出す高さ（本文は幅 w の箱の本文の列で折り返す。内包ボックスの子の領域は、塊が上ならこの下から、下ならこの上まで）
export const headHeight = (props: BoxProps, w: number): number =>
  2 * (L.border + L.padY) + textBlockHeight(props, innerWidth(w), BODY_LEAST)
