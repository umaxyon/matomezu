// ドラッグの間、ポインタを見えている範囲の端の帯へ寄せている間に、その向きへずらし続ける速さ（リストの行の並びのスクロール・ツリーの紙のずらしなど）。
// 帯（幅 EDGE_ZONE。範囲が狭ければ長さの 4 分の 1 まで狭める。真ん中でずらさないように）に入ったら動き出し、端に近いほど速く、端を越えたら一番速く（毎秒 EDGE_MAX px）。
// 入り口では遅く、端へ寄せるほど速くなるよう、深さの 2 乗で上げる。速さは時間で決め、画面の書き換えの回数によらない
export const EDGE_ZONE = 48
export const EDGE_MAX = 600

// 範囲 start〜end（画面の座標）の中のポインタの所 at での速さ（毎秒の px。end の側へは正、start の側へは負、帯の外は 0）
export function edgeSpeed(at: number, start: number, end: number): number {
  const zone = Math.max(8, Math.min(EDGE_ZONE, (end - start) / 4))
  const depth = at > end - zone ? at - (end - zone) : at < start + zone ? -(start + zone - at) : 0
  const f = Math.min(1, Math.abs(depth) / zone)
  return Math.sign(depth) * f * f * EDGE_MAX
}
