// 形の計算の共通の道具（点、矩形、折れ線）。DOM は触らない純粋な関数（docs/REVIEW-2026-10-09.md の断片化の整理）。
// 線の道筋（routing.ts）、自分に戻る線（selfloop.ts）、描画（render.ts）、線のドラッグ（edge-drag.ts）、配置の要約（report.ts）が使う

export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };

// 折れ線の区間ごとの長さ
const lengths = (path: Pt[]) => path.slice(1).map((p, i) => Math.hypot(p[0] - path[i]![0], p[1] - path[i]![1]));

// 折れ線の長さ
export const polylineLength = (path: Pt[]) => lengths(path).reduce((s, l) => s + l, 0);

// 折れ線の、長さに対する割合 t（0〜1）の点
export function pointAt(path: Pt[], t: number): Pt {
  const lens = lengths(path);
  let d = Math.min(1, Math.max(0, t)) * lens.reduce((s, l) => s + l, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) {
      const k = lens[i]! ? Math.min(1, d / lens[i]!) : 0;
      const [p, q] = [path[i]!, path[i + 1]!];
      return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    }
    d -= lens[i]!;
  }
  return path[0]!;
}

// 点 (x, y) に一番近い、折れ線の上の点の割合（0〜1）
export function nearestAt(path: Pt[], x: number, y: number): number {
  const lens = lengths(path);
  const total = lens.reduce((s, l) => s + l, 0);
  if (!total) return 0;
  let best = 0, bestD = Infinity, before = 0;
  lens.forEach((len, i) => {
    const [p, q] = [path[i]!, path[i + 1]!];
    const k = len ? Math.min(1, Math.max(0, ((x - p[0]) * (q[0] - p[0]) + (y - p[1]) * (q[1] - p[1])) / (len * len))) : 0;
    const px = p[0] + (q[0] - p[0]) * k, py = p[1] + (q[1] - p[1]) * k;
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) { bestD = d; best = (before + len * k) / total; }
    before += len;
  });
  return best;
}

// 折れ線の、長さに対する割合 at の所の、進む向きの左を指す長さ 1 の向き（画面の座標。右向きの線なら上 (0, -1)）
export function leftNormalAt(pts: Pt[], at: number): Pt {
  const lens = lengths(pts);
  const total = lens.reduce((s, l) => s + l, 0);
  let d = Math.min(1, Math.max(0, at)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) {
      const [p, q] = [pts[i]!, pts[i + 1]!], l = lens[i]! || 1;
      return [(q[1] - p[1]) / l, -(q[0] - p[0]) / l];
    }
    d -= lens[i]!;
  }
  return [0, -1];
}

// 折れ線の区間（隣り合う 2 点）の並び
export const segmentsOf = (pts: Pt[]): [Pt, Pt][] => pts.slice(1).map((p, i) => [pts[i]!, p]);

// 線分どうしが交わるか（端点が触れるだけのものは数えない）
export function segmentsCross([[ax1, ay1], [ax2, ay2]]: [Pt, Pt], [[bx1, by1], [bx2, by2]]: [Pt, Pt]) {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(ax1, ay1, ax2, ay2, bx1, by1);
  const d2 = d(ax1, ay1, ax2, ay2, bx2, by2);
  const d3 = d(bx1, by1, bx2, by2, ax1, ay1);
  const d4 = d(bx1, by1, bx2, by2, ax2, ay2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// 線分が矩形の内側を通るか（縁から 1 の内側。縁に触れるだけのものは数えない）。斜めの線分も厳密に見る
export function segmentThroughRect([[ex1, ey1], [ex2, ey2]]: [Pt, Pt], r: Rect) {
  const m = 1;
  const x0 = r.x + m, y0 = r.y + m, x1 = r.x + r.w - m, y1 = r.y + r.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang–Barsky で線分を矩形に切り取り、残れば通っている
  const dx = ex2 - ex1, dy = ey2 - ey1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ex1 - x0) && clip(dx, x1 - ex1) && clip(-dy, ey1 - y0) && clip(dy, y1 - ey1) && t0 < t1;
}

// 矩形どうしが重なるか（margin だけ離れていないと重なるとみなす）
export const rectsOverlap = (a: Rect, b: Rect, margin = 0) =>
  a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;
