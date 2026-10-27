// 形の大きさ: 幅と高さは置いたアイテムの w・h（利用者が決める）。置いたときの幅は、キャプションが切れずに見える幅（20 字まで）。
// キャプションは 1 行で、形の真ん中に置く。文字を置ける幅は形の種類で決まる（outline.ts の textRatio と inset）
import type { Size } from "../../../plugin-api"
import { captionTextWidth, TEXT_LOOK } from "../../base"
import { type Outline, SHAPE_RULES, type ShapeKind, SLANT } from "./outline"

// 形の見た目の寸法（px）。ShapeView.module.css と同じ値にする
export const SHAPE_LOOK = { border: 1, ...TEXT_LOOK } as const

const L = SHAPE_LOOK
// 一番低い高さ: 上下の枠と余白と、キャプション 1 行
export const SHAPE_MIN: Size = { w: 64, h: 2 * (L.border + L.padY) + L.line }

// 文字を置く幅（左右の端からの空き）: 形の幅 w のうち、文字を置ける幅の左右の余り
export function textInset(kind: ShapeKind, w: number): number {
  const rule = SHAPE_RULES[kind]
  return (w - w * rule.textRatio) / 2 + rule.inset
}

// 置いたときの幅: キャプションが切れずに見える幅（20 字まで。一番狭くて形の size.w）
export function placedWidth(kind: ShapeKind, caption: string): number {
  const rule = SHAPE_RULES[kind]
  const text = captionTextWidth(caption) + 2 * (L.border + L.padX)
  return Math.max(rule.size.w, Math.ceil((text + 2 * rule.inset) / rule.textRatio))
}

// 形を描く値: 輪郭（線の太さの半分だけ内側に描くので、四角より 1px ずつ小さい）と、キャプションの両端の空き。
// turned なら回した輪郭（回せる形だけ）で、キャプションは縦に置くので、両端の空きは高さから決める
export function shapeLayout(kind: ShapeKind, size: Size, turned = false): { outline: Outline; inset: number } {
  const inner = { w: Math.max(size.w - 2, 0), h: Math.max(size.h - 2, 0) }
  const rule = SHAPE_RULES[kind]
  const outline = turned && rule.turned ? rule.turned.outline(inner) : rule.outline(inner, SLANT)
  return { outline, inset: textInset(kind, turned && rule.turned ? size.h : size.w) }
}
