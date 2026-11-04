// 文字の塊: キャプション 1 行・区切り線・本文を上から並べたもの（箱やデータなど、キャプションと本文を持つ形が共に使う）。
// 本文は本文の列の幅で折り返し、高さに収まらない分は最後に出す行の終わりに … を付けて切る。本文が 1 行も出ない高さなら、区切り線も出さない。
// 本文の列は、本文の幅（bodyWidth）を書いていればその幅（キャプションの幅と、一番狭い列の幅より狭くはしない。中の幅より広ければ中いっぱい）で、
// 置き場所はキャプションの寄せに倣う。寸法は形の中の幅（枠と左右の余白の内側）で受け取る。画面（TextBlockView）はこの値のとおりに描く
import { type Align, captionTextWidth, TEXT_LOOK } from "./fields"
import { clampRich, type RichLine, wrapRich } from "./rich"

const L = TEXT_LOOK
// キャプション 1 行の高さと、区切り線とその上下の間の高さ
const BLOCK_CAPTION = L.line
const BLOCK_RULE = 2 * L.ruleGap + 1

// キャプションの下の、区切り線（rule なら）と本文 lines 行の高さ（本文が 0 行なら区切り線も出さないので 0）。
// キャプションと本文を持つ形が、本文の行数から高さを決めるときに使う
export const blockBodyHeight = (lines: number, rule: boolean): number =>
  lines > 0 ? (rule ? BLOCK_RULE : 0) + lines * L.line : 0

// キャプションの下の高さ height に一番近い本文の行数（0 から。blockBodyHeight の逆。区切り線の半分より低ければ 0）
export function blockBodyLines(height: number, rule: boolean): number {
  const line = rule ? BLOCK_RULE : 0
  if (height < line / 2) return 0
  return Math.max(0, Math.round((height - line) / L.line))
}

// 文字の塊の項目
export interface BlockProps {
  caption: string
  rule: boolean
  body: string
  captionAlign: Align
  bodyAlign: Align
  bodyWidth?: number | undefined
}

// 文字の塊の名前（物の名前を出す所が使う。base の labelOf）: キャプション、空白だけなら本文の最初の空でない行（どちらも無ければ空）
export const blockLabel = (props: Pick<BlockProps, "caption" | "body">): string =>
  props.caption.trim() !== "" ? props.caption : (props.body.split("\n").find(l => l.trim() !== "") ?? "")

// 本文の列: 中の左からの位置と幅
export interface BodyColumn {
  x: number
  w: number
}

export interface TextBlock {
  body: RichLine[] // 描く本文の行（本文が無いか、1 行も出ない高さなら空）
  rule: boolean // 区切り線を引くか
  column: BodyColumn
  height: number // 塊の高さ（キャプション・区切り線・出す本文の行）
}

// 本文の幅を縮められる一番狭い幅: キャプションの幅（20 字まで）と least（形の一番狭い中の幅）の広いほう
export const bodyMinWidth = (props: BlockProps, least: number): number =>
  Math.max(captionTextWidth(props.caption), least)

// 中の幅 inner の本文の列（本文の幅が無いか、中より広ければ中いっぱい）
export function bodyColumn(props: BlockProps, inner: number, least: number): BodyColumn {
  const cw = Math.min(inner, Math.max(props.bodyWidth ?? inner, bodyMinWidth(props, least)))
  const x = props.captionAlign === "left" ? 0 : props.captionAlign === "right" ? inner - cw : (inner - cw) / 2
  return { x, w: cw }
}

// 本文の列の端（side）をつかんで、紙の上で dx だけ横に動かしたときの本文の幅（中いっぱいになれば null。本文の幅を消す）。
// キャプションが中央寄せなら両側が同じだけ縮み、左寄せなら右の端、右寄せなら左の端だけが動く
export function bodyWidthAfter(
  props: BlockProps,
  inner: number,
  least: number,
  side: "left" | "right",
  dx: number,
): number | null {
  const now = bodyColumn(props, inner, least).w
  const grow = side === "right" ? dx : -dx
  const next = Math.round(now + (props.captionAlign === "center" ? 2 * grow : grow))
  if (next >= inner) return null
  return Math.max(next, bodyMinWidth(props, least))
}

// 本文の列の端のうち、つかんで動かせる側（キャプションの寄せの側の端は動かさない）
export const bodySides = (props: Pick<BlockProps, "captionAlign">): readonly ("left" | "right")[] =>
  props.captionAlign === "left" ? ["right"] : props.captionAlign === "right" ? ["left"] : ["left", "right"]

// 中の幅 inner・高さ maxH に収めた文字の塊（本文は収まる行まで）
export function textBlock(props: BlockProps, inner: number, least: number, maxH: number): TextBlock {
  const column = bodyColumn(props, inner, least)
  if (props.body === "") return { body: [], rule: false, column, height: BLOCK_CAPTION }
  const fits = Math.floor((maxH - BLOCK_CAPTION - (props.rule ? BLOCK_RULE : 0)) / L.line)
  if (fits <= 0) return { body: [], rule: false, column, height: BLOCK_CAPTION }
  const body = clampRich(wrapRich(props.body, column.w, L.body), fits, column.w, L.body)
  return { body, rule: props.rule, column, height: BLOCK_CAPTION + blockBodyHeight(body.length, props.rule) }
}

// 本文を全部出したとき（maxLines があれば、本文をその行数までにしたとき）の文字の塊の高さ（中の幅 inner で折り返す）
export function textBlockHeight(props: BlockProps, inner: number, least: number, maxLines = Infinity): number {
  if (props.body === "") return BLOCK_CAPTION
  const lines = wrapRich(props.body, bodyColumn(props, inner, least).w, L.body).length
  return BLOCK_CAPTION + blockBodyHeight(Math.min(lines, maxLines), props.rule)
}
