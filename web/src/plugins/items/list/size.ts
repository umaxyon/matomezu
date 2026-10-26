// リストの大きさと行の並び: 幅と高さは置いたアイテムの w・h（利用者が決める。行が増えても伸びない。入らない行はリストの中でスクロールする）。
// 上にキャプションの見出し（1 行）、その下の台紙に行を 1 枚ずつのカードとして並べ（台紙の内側に余白、行の間に隙間）、最後に行を足す「＋」の行（角の丸いボタン）。
// 行の高さは、本文を何行分見せるか（行数）で決める。行が行数（lines）を持てばその行数（本文の量によらない。ドラッグとそろえるボタンが書く）。
// 持たない行はそろえる: 行数を持たない行の本文の折り返した行数のうち一番多い数と PLACE_LINES の小さい方（本文の無い行も同じ高さ）。収まらない本文は … で切る。
// 文字の幅と折り返しは core/text で計算するので、画面でも常駐でも同じ行になる。画面（ListView）はこの値のとおりに描く
import { captionTextWidth, clampLines, PLACE_LINES, type Size, TEXT_LOOK, wrap } from "../../../plugin-api"
import type { ListRow } from "./list"

// リストの見た目の寸法（px。どのテーマでも同じ）。ListView.module.css と同じ値にする。文字の寸法は形で共通（shape の TEXT_LOOK）
export const LIST_LOOK = {
  border: 1,
  padX: TEXT_LOOK.padX, // 見出しの左右の余白
  padY: TEXT_LOOK.padY, // 見出しの上下の余白
  line: TEXT_LOOK.line,
  ruleGap: TEXT_LOOK.ruleGap,
  inset: 8, // 台紙の内側の余白（行のカードの左右と、最初の行の上）
  gap: 6, // 行のカードの間の隙間（行の下に取る）
  rowPadX: 12, // 行のカードの左右の余白
  rowPadY: 8, // 行のカードの上下の余白
  check: 14, // チェックの印の大きさ
  checkGap: 8, // チェックの印と行の文字の間
  add: 32, // 「＋」の行の高さ（上下 4px の空きと、24px のボタン）
} as const

const L = LIST_LOOK
const HEAD = 2 * L.padY + L.line + 1 // 見出し（キャプション 1 行）と、その下の線
const RULE = 2 * L.ruleGap + 1
const EMPTY_ROW = 2 * L.rowPadY + L.line // 本文を出さない行のカード（キャプション 1 行）

export const LIST_SIZE: Size = { w: 240, h: 2 * L.border + HEAD + L.inset + 3 * (EMPTY_ROW + L.gap) + L.add } // 置いたときの幅の下限と、置いたときの高さ（行 3 つぶんの空き）
export const LIST_MIN: Size = { w: 64, h: 2 * L.border + HEAD + L.inset + L.add } // 一番狭い幅と、一番低い高さ（見出しと「＋」の行）

export interface RowLayout {
  lines: number // 本文を見せる行数
  height: number // 行のカードの高さ（下の隙間は含まない）
  body: string[] // 描く本文の行（行数で切る。本文が無ければ空）
  rule: boolean // 区切り線を引くか
}

export const MAX_ROW_LINES = 50 // 行に持たせる行数の上限

// 本文を lines 行分見せる行のカードの高さ
export const rowHeight = (lines: number): number => EMPTY_ROW + (lines > 0 ? RULE + lines * L.line : 0)

// 行の高さ height に一番近い行数（0 から MAX_ROW_LINES）。ドラッグで高さを変えるとき
export function linesFor(height: number): number {
  const lines = Math.round((height - EMPTY_ROW - RULE) / L.line)
  return Math.min(MAX_ROW_LINES, Math.max(0, height < EMPTY_ROW + RULE / 2 ? 0 : lines))
}

// 行の行数の書き換え（そろえるボタンと AI の row-lines）: 決めた行数（全部の行が同じ高さ）、"max"（全部の行を本文の一番長い行が全部見える行数に）、
// "fit"（行ごとに、その行の本文が全部見える行数に。高さは行ごとに違う）、null（行数を消し、行数を持たない行の決まりでそろえる）
export type RowsLines = number | "max" | "fit" | null

// 行の文字を置ける幅（チェックリストならチェックの印の分を除く）
const textWidthOf = (w: number, checklist: boolean) =>
  w - 2 * (L.border + L.inset + L.rowPadX) - (checklist ? L.check + L.checkGap : 0)

// 幅 w のリストの行ごとの本文の折り返し
const wrapAll = (rows: readonly ListRow[], inner: number) =>
  rows.map(r => (r.props.body === "" ? [] : wrap(r.props.body, inner, TEXT_LOOK.body)))

// 書き換え all を当てたときの、行ごとの行数（行数を持たない行は undefined。all が無ければ行の持つ行数のまま）
export function rewrittenLines(
  rows: readonly ListRow[],
  w: number,
  checklist: boolean,
  all: RowsLines | undefined,
): (number | undefined)[] {
  if (all === undefined) return rows.map(r => r.props.lines)
  if (all === null) return rows.map(() => undefined)
  if (typeof all === "number") return rows.map(() => all)
  const counts = wrapAll(rows, textWidthOf(w, checklist)).map(b => Math.min(b.length, MAX_ROW_LINES))
  return all === "fit" ? counts : rows.map(() => Math.max(0, ...counts))
}

// 幅 w のリストに描く行の並び。all を渡せば、行の持つ行数の代わりにそれを当てて決める（そろえるボタンの下書き）
export function listLayout(rows: readonly ListRow[], w: number, checklist: boolean, all?: RowsLines): RowLayout[] {
  const inner = textWidthOf(w, checklist)
  const wrapped = wrapAll(rows, inner)
  const own = rewrittenLines(rows, w, checklist, all)
  const counts = wrapped.filter((_, i) => own[i] === undefined).map(b => b.length)
  const auto = Math.min(Math.max(0, ...counts), PLACE_LINES)
  return rows.map((r, i) => {
    const lines = own[i] ?? auto
    const body = wrapped[i] ?? []
    return {
      lines,
      height: rowHeight(lines),
      body: body.length > 0 && lines > 0 ? clampLines(body, lines, inner, TEXT_LOOK.body) : [],
      rule: r.props.rule && body.length > 0 && lines > 0,
    }
  })
}

// キャプションが PLACE_CAPTION 字まで切れずに見える幅（超えるなら、その字数と … が見える幅。一番狭くて LIST_MIN の幅）
export function listCaptionWidth(caption: string): number {
  return Math.max(LIST_MIN.w, captionTextWidth(caption) + 2 * (L.border + L.padX))
}

// 置いたときの幅: キャプションが見える幅（listCaptionWidth）と、LIST_SIZE の幅の大きい方
export const placedListWidth = (caption: string): number => Math.max(LIST_SIZE.w, listCaptionWidth(caption))
