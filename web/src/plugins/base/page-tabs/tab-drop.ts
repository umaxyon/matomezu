// ページタブをドラッグしているときの、落とす所の計算（純粋）

// ポインタの x（タブの中心の x と同じ座標）で、動かすタブを除いたタブの並び（centers は左から順の中心の x）の何番目に入るか。
// 中心より右にあれば、そのタブの後ろ。返す値はアクション page-move の index にそのまま使える
export function dropIndex(centers: readonly number[], x: number): number {
  return centers.filter(c => c < x).length
}

// 四角 box（画面の座標）の外に margin を足した範囲の中にポインタがあるか（外で離したときに取り消すかを決める）
export function within(
  box: { left: number; right: number; top: number; bottom: number },
  p: { x: number; y: number },
  margin: number,
): boolean {
  return p.x >= box.left - margin && p.x <= box.right + margin && p.y >= box.top - margin && p.y <= box.bottom + margin
}
