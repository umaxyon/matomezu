// シェイプの大きさ: 絵は決まった大きさで上の真ん中に置き、キャプションは絵の足元に、形の幅で折り返して真ん中に置く。
// 変えられるのは幅だけ（キャプションを折り返す幅）。高さは絵とキャプションの行数から決まる
import type { Size } from "../../../plugin-api"
import { captionTextWidth, TEXT_LOOK, wrap } from "../../base"
import type { Picture } from "./pictures"

// 寸法（px）。ArtView.module.css と同じ値にする
export const ART_LOOK = {
  padY: 4, // 上下の余白
  padX: 4, // キャプションの左右の余白
  gap: 2, // 絵とキャプションの間
  line: TEXT_LOOK.line, // キャプションの 1 行の高さ
  font: TEXT_LOOK.caption,
  maxW: 160, // 置いたときの幅の上限（これより長いキャプションは折り返す）
} as const

const L = ART_LOOK

// 一番狭い幅: 絵の幅に余白を足した幅か 64px の広いほう
export const minWidth = (p: Picture): number => Math.max(64, p.size.w + 2 * L.padX)

// 置いたときの幅: キャプションが 1 行で見える幅（一番狭くて minWidth、広くて maxW）
export const placedWidth = (p: Picture, caption: string): number =>
  Math.min(L.maxW, Math.max(minWidth(p), captionTextWidth(caption) + 2 * L.padX))

// 幅 w でのキャプションの行
export const captionLines = (caption: string, w: number): string[] =>
  caption === "" ? [] : wrap(caption, Math.max(w - 2 * L.padX, 1), L.font)

// 幅 w の高さ
export function artHeight(p: Picture, caption: string, w: number): number {
  const lines = captionLines(caption, w).length
  return L.padY + p.size.h + (lines > 0 ? L.gap + lines * L.line : 0) + L.padY
}

// 置いたシェイプの大きさ（w が無ければ置いたときの幅。高さはいつも中身から決める）
export function artSize(p: Picture, caption: string, w: number | undefined): Size {
  const width = Math.max(w ?? placedWidth(p, caption), minWidth(p))
  return { w: width, h: artHeight(p, caption, width) }
}
