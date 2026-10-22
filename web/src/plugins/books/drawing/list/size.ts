// リストの大きさと行の並び: 幅と高さは置いたアイテムの w・h（利用者が決める。行が増えても伸びない。入らない行はリストの中でスクロールする）。
// 上にキャプションの見出し（1 行）、その下に行を並べ、最後に行を足す「＋」の行。
// 行の高さはそろえる: 全部の行の本文の折り返した行数のうち一番多い数と PLACE_LINES の小さい方まで本文を出し（収まらない本文は … で切る）、本文の無い行も同じ高さ。
// 文字の幅と折り返しは core/text で計算するので、画面でも常駐でも同じ行になる。画面（ListView）はこの値のとおりに描く
import type { Size } from "../../../../core/geom"
import { clampLines, textWidth, wrap } from "../../../../core/text/text"
import { BOX_LOOK, PLACE_CAPTION, PLACE_LINES } from "../box/size"
import type { ListRow } from "."

// リストの見た目の寸法（px）。ListView.module.css と同じ値にする。字と余白は箱と同じ
export const LIST_LOOK = {
  border: 1,
  padX: BOX_LOOK.padX,
  padY: BOX_LOOK.padY,
  line: BOX_LOOK.line,
  ruleGap: BOX_LOOK.ruleGap,
  check: 14, // チェックの印の大きさ
  checkGap: 6, // チェックの印と行の文字の間
  add: 24, // 「＋」の行の高さ
} as const

const L = LIST_LOOK
const HEAD = 2 * L.padY + L.line + 1 // 見出し（キャプション 1 行）と、その下の線
const RULE = 2 * L.ruleGap + 1
const EMPTY_ROW = 2 * L.padY + L.line + 1 // 本文を出さない行（キャプション 1 行）と、その下の線

export const LIST_SIZE: Size = { w: 240, h: 2 * L.border + HEAD + 3 * EMPTY_ROW + L.add } // 置いたときの幅の下限と、置いたときの高さ（行 3 つぶんの空き）
export const LIST_MIN: Size = { w: 64, h: 2 * L.border + HEAD + L.add } // 一番狭い幅と、一番低い高さ（見出しと「＋」の行）

export interface RowLayout {
  body: string[] // 描く本文の行（そろえた行数で切る。本文が無ければ空）
  rule: boolean // 区切り線を引くか
}

export interface ListLayout {
  lines: number // そろえた本文の行数
  height: number // 1 行の高さ（下の線を含む）
  rows: RowLayout[]
}

// 行の文字を置ける幅（チェックリストならチェックの印の分を除く）
const textWidthOf = (w: number, checklist: boolean) =>
  w - 2 * (L.border + L.padX) - (checklist ? L.check + L.checkGap : 0)

// 幅 w のリストに描く行の並び
export function listLayout(rows: readonly ListRow[], w: number, checklist: boolean): ListLayout {
  const inner = textWidthOf(w, checklist)
  const wrapped = rows.map(r => (r.props.body === "" ? [] : wrap(r.props.body, inner, BOX_LOOK.body)))
  const lines = Math.min(Math.max(0, ...wrapped.map(b => b.length)), PLACE_LINES)
  const height = EMPTY_ROW + (lines > 0 ? RULE + lines * L.line : 0)
  return {
    lines,
    height,
    rows: rows.map((r, i) => {
      const body = wrapped[i] ?? []
      return {
        body: body.length > 0 && lines > 0 ? clampLines(body, lines, inner, BOX_LOOK.body) : [],
        rule: r.props.rule && body.length > 0 && lines > 0,
      }
    }),
  }
}

// キャプションが PLACE_CAPTION 字まで切れずに見える幅（超えるなら、その字数と … が見える幅。一番狭くて LIST_MIN の幅）
export function listCaptionWidth(caption: string): number {
  const chars = [...caption]
  const shown = chars.length > PLACE_CAPTION ? `${chars.slice(0, PLACE_CAPTION).join("")}…` : caption
  return Math.max(LIST_MIN.w, Math.ceil(textWidth(shown, BOX_LOOK.caption)) + 2 * (L.border + L.padX))
}

// 置いたときの幅: キャプションが見える幅（listCaptionWidth）と、LIST_SIZE の幅の大きい方
export const placedListWidth = (caption: string): number => Math.max(LIST_SIZE.w, listCaptionWidth(caption))
