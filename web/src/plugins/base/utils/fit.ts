// 右クリックのメニューや選ぶ物の吹き出し（ChoiceBubble）を表示領域に収める置き方
import type { Point, Size } from "../../../core/geom"

// 大きさ size の四角の左上を at に置き、bounds（左上が 0, 0 の範囲）からはみ出す分だけ左と上に戻す（範囲より大きければ左上をそろえる）
export function fitInside(at: Point, size: Size, bounds: Size): Point {
  return {
    x: Math.max(0, Math.min(at.x, bounds.w - size.w)),
    y: Math.max(0, Math.min(at.y, bounds.h - size.h)),
  }
}

// 吹き出しを出す点。above は、下に入らないときに吹き出しの下端をそろえる高さ。
// side が above なら、先に above の上に置き、窓の上に入らなければ点の下へ返す
export interface BubbleAt extends Point {
  above?: number
  side?: "below" | "above"
}

// 点と吹き出しのあいだ
const GAP = 4

// 大きさ size の吹き出しの左上: at の下に置き、窓の下に入らなければ above の上へ返し（side が above なら上と下を逆に試し）、そのうえで窓に収める
export function placeBubble(at: BubbleAt, size: Size, view: Size): Point {
  const below = at.y + GAP
  const above = (at.above ?? at.y) - GAP - size.h
  const y = at.side === "above" ? (above >= 0 ? above : below) : below + size.h <= view.h ? below : above
  return fitInside({ x: at.x, y }, size, view)
}
