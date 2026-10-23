// 線のキャプションの札の置き方。DOM は触らない純粋な関数。
// 札は、線の長さに対する割合 captionAt（無ければ真ん中）の所から、進む向きの左へ captionOffset（無ければ 0）離した点を真ん中にして置く。
// 折り返す幅は、上限 CAPTION_MAX_W と、線の長さから余白を引いた幅の狭い方（箱どうしが近ければ縦に折り返して、箱にかぶらないように）。
// ただし、その所の区間が縦向きの線と、自分に戻る線は狭めない（縦の線で箱とぶつかるのは札の高さなので、狭めると行が増えてかえってぶつかる）。
// 札の枠は、幅を折り返しの幅にし、高さは CAPTION_BOX_H と十分に取る（描く側は枠の中で札を真ん中にそろえ、札の大きさを測らずに済む）
import type { Point } from "../../../../core/geom"
import { leftNormalAt, pointAt, polylineLength } from "./geom"

export const CAPTION_MAX_W = 160
export const CAPTION_MIN_W = 48
const CAPTION_MARGIN = 16
export const CAPTION_BOX_H = 200
// キャプションを線から離せる量（±）
export const CAPTION_OFFSET_MAX = 60

// 線から離す量を、離せる範囲に収める
export const clampCaptionOffset = (v: number): number => Math.max(-CAPTION_OFFSET_MAX, Math.min(CAPTION_OFFSET_MAX, v))

export interface CaptionPlace {
  at?: number // 線の長さに対する割合（0〜1）
  offset?: number // 線から離す px（進む向きの左が正）
}

// 札の枠（紙の座標。小数 1 桁）。点が 2 つ未満なら null
export function captionBox(
  points: Point[],
  place: CaptionPlace,
  loop: boolean,
): { x: number; y: number; w: number; h: number } | null {
  if (points.length < 2) return null
  const at = place.at ?? 0.5
  const off = clampCaptionOffset(place.offset ?? 0)
  const { x: nx, y: ny } = leftNormalAt(points, at)
  const vertical = Math.abs(nx) > Math.abs(ny) // 左の向きが横なら、区間は縦向き
  const w =
    loop || vertical
      ? CAPTION_MAX_W
      : Math.max(CAPTION_MIN_W, Math.min(CAPTION_MAX_W, polylineLength(points) - CAPTION_MARGIN))
  const { x: bx, y: by } = pointAt(points, at)
  const round = (v: number) => Math.round(v * 10) / 10
  return { x: round(bx + nx * off - w / 2), y: round(by + ny * off - CAPTION_BOX_H / 2), w, h: CAPTION_BOX_H }
}
