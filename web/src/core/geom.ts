// 平面の点と大きさ
export interface Point {
  x: number
  y: number
}
export interface Size {
  w: number
  h: number
}

// 大きさ size の四角の左上を at に置き、bounds（左上が 0, 0 の範囲）からはみ出す分だけ左と上に戻す（範囲より大きければ左上をそろえる）
export function fitInside(at: Point, size: Size, bounds: Size): Point {
  return {
    x: Math.max(0, Math.min(at.x, bounds.w - size.w)),
    y: Math.max(0, Math.min(at.y, bounds.h - size.h)),
  }
}
