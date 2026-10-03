// 線の道筋（点の並び）を決める。画面に依存しない純粋な関数（docs/ROUTE-plan.md、docs/ARCH-plan.md）。
// 折れ線は、始点の箱から出る向き（exit）、終点の箱に入る向き（enter）、途中の区間の位置の並び（via）で表す:
//   始点の箱から exit の向きに出て、via の順に縦と横の区間を交互に置き、最後に enter の向きで終点の箱に入る。
//   via の 1 つ目は、出た区間と交わる向きの区間の位置（exit が横なら縦の区間の x 座標、2 つ目は横の区間の y 座標、…）。
//   exit と enter が同じ向きなら via は奇数個、違えば偶数個（0 個が L 字）。出る辺（左か右か）は via の位置から決まる。
// 自動の道筋（Z 字・L 字・コの字）も、この形を作ってから点の並びにする。手で直した via は、引けるあいだはそのまま使う

import type { Arrangement, Axis } from "./types";

export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = [number, number];

// 折れ線の形（描いているもの。手で直していなければ自動で決めたもの）
export interface RouteShape { exit: Axis; enter: Axis; via: number[] }

// ドラッグで動かせる途中の区間。via の index 番目の値を、axis の座標として lo〜hi の間で動かせる
export interface Segment { index: number; axis: "x" | "y"; lo: number; hi: number }

export interface RouteInput {
  a: Rect;                // 始点の箱（線がつながる範囲。ワールドの座標）
  b: Rect;                // 終点の箱
  elbow: boolean;         // 折れ線か（直線なら false）
  exit: Axis | null;      // 向きの指定（null は自動）
  enter: Axis | null;
  via: number[] | null;   // 手で直した途中の区間の位置（null は自動）
  bend: number | null;    // 以前の持ち方（Z 字の中棒の割合）。via に移し替える
  obstacles: Rect[];      // 線が通ってほしくない箱（同じ親のほかの箱）
  margin: number;         // 途中の区間を、両端の箱の辺から最低これだけ離す（BEND_MARGIN）
}

// データに書き戻すこと（描画の側ではデータを書き換えない。graph が受け取って直す）
export interface RouteFix {
  clearDirections?: boolean; // 向きの指定を消す（横か縦に並ぶのに、両端の向きがそろわない）
  clearVia?: boolean;        // 手で直した via を消す（もう引けない、直線になった）
  clearBend?: boolean;       // 以前の bend を消す
  migrate?: RouteShape;           // 以前の bend を、この形として書き込む（bend は消す）
}

export interface Route {
  points: Pt[];
  arrangement: Arrangement;
  shape: RouteShape | null;  // 折れ線の形（直線や、まっすぐに並ぶ箱どうしなら null）
  segments: Segment[];  // ドラッグで動かせる途中の区間
  fix: RouteFix;
}

// 片方の隙間がもう片方のこれだけより小さければ、L 字ではなく Z 字にする（見た目で調整する前提の仮の値）
export const ELBOW_Z_RATIO = 1 / 3;
// コの字の外を回る区間を、外側の辺からこれだけ離す（自動のとき）
export const LOOP_DEPTH = 24;
// Z 字の中棒の位置を探すときの刻み
const BEND_STEP = 4;

const flip = (a: Axis): Axis => (a === "horizontal" ? "vertical" : "horizontal");
const center = (r: Rect): Pt => [r.x + r.w / 2, r.y + r.h / 2];

// 2 つの箱の並び。横に並ぶ（上下の範囲が重なり、左右に離れている）、縦に並ぶ、斜め、重なっている
export function arrangementOf(a: Rect, b: Rect): Arrangement {
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x);
  return yOverlap && xOverlap ? "overlap" : yOverlap ? "side" : xOverlap ? "stack" : "diagonal";
}

// 中心 (cx, cy) から (dx, dy) 方向へ伸ばした線が矩形の縁と交わる点
function clipToRect(cx: number, cy: number, w: number, h: number, dx: number, dy: number): Pt {
  const tx = dx ? (w / 2) / Math.abs(dx) : Infinity;
  const ty = dy ? (h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return [cx + dx * t, cy + dy * t];
}

// 点の並びのどこかの区間が、矩形の内側を通るか（縁に触れるだけのものは数えない）。区間はどれも縦か横か、両端の短い直線
export function passes(pts: Pt[], r: Rect) {
  const x0 = r.x + 1, y0 = r.y + 1, x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
  return pts.slice(1).some(([qx, qy], i) => {
    const [px, py] = pts[i]!;
    return Math.max(px, qx) > x0 && Math.min(px, qx) < x1 && Math.max(py, qy) > y0 && Math.min(py, qy) < y1;
  });
}

// 形（exit / enter / via）から点の並びを作る。引けない（出る区間が始点の箱の中へ向かう、入る区間が終点の箱の中から来る、
// 線が両端の箱の中を通る、via の数が向きと合わない）なら null
export function shapePoints(a: Rect, b: Rect, s: RouteShape): Pt[] | null {
  const { exit, enter, via } = s;
  if ((exit === enter) !== (via.length % 2 === 1)) return null;
  const [acx, acy] = center(a), [bcx, bcy] = center(b);
  // 出る辺: 最初に向かう位置が、始点の箱のどちら側にあるか
  const first = via.length ? via[0]! : exit === "horizontal" ? bcx : bcy;
  let c: Pt;
  if (exit === "horizontal") {
    if (first >= a.x + a.w) c = [a.x + a.w, acy];
    else if (first <= a.x) c = [a.x, acy];
    else return null;
  } else {
    if (first >= a.y + a.h) c = [acx, a.y + a.h];
    else if (first <= a.y) c = [acx, a.y];
    else return null;
  }
  const pts: Pt[] = [c];
  let axis = exit; // 次に引く区間の向き
  for (const v of via) {
    c = axis === "horizontal" ? [v, c[1]] : [c[0], v];
    pts.push(c);
    axis = flip(axis);
  }
  // 入る辺: 終点の箱の手前まで来て、enter の向きで入る
  if (enter === "horizontal") {
    c = [c[0], bcy];
    pts.push(c);
    if (c[0] <= b.x) pts.push([b.x, bcy]);
    else if (c[0] >= b.x + b.w) pts.push([b.x + b.w, bcy]);
    else return null;
  } else {
    c = [bcx, c[1]];
    pts.push(c);
    if (c[1] <= b.y) pts.push([bcx, b.y]);
    else if (c[1] >= b.y + b.h) pts.push([bcx, b.y + b.h]);
    else return null;
  }
  const out = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
  if (out.length < 2 || passes(out, a) || passes(out, b)) return null;
  return out;
}

// 形の途中の区間のうち、ドラッグで動かせるものと、その範囲。最初の区間は始点の箱の今いる側から、最後の区間は終点の箱の今いる側から
// 外へ出ない（margin 空ける）。途中の区間は自由
export function segmentsOf(a: Rect, b: Rect, s: RouteShape, margin: number): Segment[] {
  const n = s.via.length;
  return s.via.map((v, i) => {
    const axis: "x" | "y" = (i % 2 === 0) === (s.exit === "horizontal") ? "x" : "y";
    let lo = -Infinity, hi = Infinity;
    const keepOut = (r: Rect) => {
      const [start, end] = axis === "x" ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
      if (v >= end) lo = Math.max(lo, end + margin);
      else if (v <= start) hi = Math.min(hi, start - margin);
    };
    if (i === 0) keepOut(a);
    if (i === n - 1) keepOut(b);
    return { index: i, axis, lo, hi };
  });
}

// 長さ 0 になった途中の区間の折れ目をまとめる（S 字の真ん中の区間が 0 なら Z 字に戻る）。区間の向きの数は変わらない
export function simplifyVia(a: Rect, b: Rect, s: RouteShape): number[] {
  const [acx, acy] = center(a), [bcx, bcy] = center(b);
  const via = [...s.via];
  // i 番目の区間は、前の位置から次の位置までのびる。前は 1 つ前の値（無ければ始点の中心）、次は 1 つ後の値（無ければ終点の中心）
  const startOf = (i: number) => {
    const xAxis = (i % 2 === 0) === (s.exit === "horizontal"); // この区間は x の位置（縦の区間）
    return xAxis ? acy : acx;
  };
  const endOf = (i: number) => {
    const xAxis = (i % 2 === 0) === (s.exit === "horizontal");
    return xAxis ? bcy : bcx;
  };
  for (let changed = true; changed && via.length > 1;) {
    changed = false;
    for (let i = 0; i < via.length; i++) {
      const prev = i > 0 ? via[i - 1]! : startOf(i);
      const next = i < via.length - 1 ? via[i + 1]! : endOf(i);
      if (Math.abs(prev - next) > 0.5) continue;
      via.splice(i + 1 < via.length ? i : i - 1, 2);
      changed = true;
      break;
    }
  }
  return via;
}

// 線の道筋を決める
export function route(r: RouteInput): Route {
  const { a, b } = r;
  const arrangement = arrangementOf(a, b);
  const fix: RouteFix = {};
  const [acx, acy] = center(a), [bcx, bcy] = center(b);
  const plain = (points: Pt[]): Route => {
    if (r.via) fix.clearVia = true;
    if (r.bend != null) fix.clearBend = true;
    return { points, arrangement, shape: null, segments: [], fix };
  };
  const drawn = (shape: RouteShape, points: Pt[]): Route =>
    ({ points, arrangement, shape, segments: segmentsOf(a, b, shape, r.margin), fix });

  if (arrangement === "overlap" || (!r.elbow && arrangement === "diagonal")) {
    return plain([clipToRect(acx, acy, a.w, a.h, bcx - acx, bcy - acy), clipToRect(bcx, bcy, b.w, b.h, acx - bcx, acy - bcy)]);
  }
  if (!r.elbow) return plain(alignedPoints(a, b, arrangement as "side" | "stack"));

  // 横か縦に並ぶ箱どうしで、指定した両端の向きがそろわなくなったら（箱を動かした）、指定を両方とも自動に戻す
  let { exit, enter } = r;
  if ((arrangement === "side" || arrangement === "stack") && exit && enter && exit !== enter) {
    fix.clearDirections = true;
    exit = enter = null;
  }

  // 手で直した形。引けるあいだはそのまま使う。引けなくなったら消して、向きの指定も消して自動に戻す（最適な形に変わる方へ寄せる）
  if (r.via) {
    if (exit && enter) {
      const shape = { exit, enter, via: r.via };
      const pts = shapePoints(a, b, shape);
      if (pts) return drawn(shape, pts);
    }
    fix.clearVia = true;
    fix.clearDirections = true;
    exit = enter = null;
  }

  if (arrangement === "side" || arrangement === "stack") {
    const across: Axis = arrangement === "side" ? "vertical" : "horizontal"; // 並びと交わる向き。これに固定すると外を回るコの字
    if ((exit ?? enter) === across) {
      const shape = loopShape(a, b, arrangement);
      return drawn(shape, shapePoints(a, b, shape) ?? alignedPoints(a, b, arrangement));
    }
    if (r.bend != null) fix.clearBend = true;
    return { points: alignedPoints(a, b, arrangement), arrangement, shape: null, segments: [], fix };
  }

  const shape = elbowShape(a, b, exit, enter, r.bend, r.obstacles, r.margin);
  if (r.bend != null) {
    if (shape.via.length === 1) fix.migrate = shape;
    else fix.clearBend = true;
  }
  return drawn(shape, shapePoints(a, b, shape) ?? [[acx, acy], [bcx, bcy]]);
}

// 横（縦）に並ぶ箱どうしをまっすぐ結ぶ。重なる範囲の真ん中で水平（垂直）に
function alignedPoints(a: Rect, b: Rect, arr: "side" | "stack"): Pt[] {
  if (arr === "side") {
    const y = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2;
    return a.x < b.x ? [[a.x + a.w, y], [b.x, y]] : [[a.x, y], [b.x + b.w, y]];
  }
  const x = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
  return a.y < b.y ? [[x, a.y + a.h], [x, b.y]] : [[x, a.y], [x, b.y + b.h]];
}

// 横に並ぶ箱どうしを上下の辺から（縦に並ぶなら左右の辺から）結ぶコの字。両方の箱の同じ側から出て外を回る。
// 回る道の短い方の側（同じなら下か右）。深さは LOOP_DEPTH
function loopShape(a: Rect, b: Rect, arr: "side" | "stack"): RouteShape {
  if (arr === "side") {
    const low = Math.max(a.y + a.h, b.y + b.h) + LOOP_DEPTH, high = Math.min(a.y, b.y) - LOOP_DEPTH;
    const below = (low - (a.y + a.h)) + (low - (b.y + b.h)) <= (a.y - high) + (b.y - high);
    return { exit: "vertical", enter: "vertical", via: [below ? low : high] };
  }
  const rx = Math.max(a.x + a.w, b.x + b.w) + LOOP_DEPTH, lx = Math.min(a.x, b.x) - LOOP_DEPTH;
  const right = (rx - (a.x + a.w)) + (rx - (b.x + b.w)) <= (a.x - lx) + (b.x - lx);
  return { exit: "horizontal", enter: "horizontal", via: [right ? rx : lx] };
}

// 斜めに離れた箱どうしの折れ線の形。始点・終点の向き（exit / enter）で決める:
// - 左右・左右: 横・縦・横の Z 字、上下・上下: 縦・横・縦の Z 字
// - 左右・上下: 横に出て縦に入る L 字、上下・左右: 縦に出て横に入る L 字
// - 自動のある端は、もう一方に合う形から、箱と箱の間の隙間（横 gx、縦 gy）で選ぶ: 片方の隙間がもう片方の 1/3
//   （ELBOW_Z_RATIO）より小さければ Z 字、それ以外は L 字（両方自動なら、隙間の大きい向きに先に出る）
// Z 字の中棒は、bend（以前の持ち方）があればその割合、無ければ真ん中か、ほかの箱を避けた位置
function elbowShape(a: Rect, b: Rect, exit: Axis | null, enter: Axis | null, bend: number | null, obstacles: Rect[], margin: number): RouteShape {
  const [acx, acy] = center(a), [bcx, bcy] = center(b);
  // 向き合う辺（a の出る辺と b の入る辺）の位置
  const ax = bcx > acx ? a.x + a.w : a.x, bx = bcx > acx ? b.x : b.x + b.w;
  const ay = bcy > acy ? a.y + a.h : a.y, by = bcy > acy ? b.y : b.y + b.h;
  const gx = Math.abs(bx - ax), gy = Math.abs(by - ay);
  const z = (axis: Axis): RouteShape => {
    const [from, to] = axis === "horizontal" ? [ax, bx] : [ay, by];
    const make = (m: number): RouteShape => ({ exit: axis, enter: axis, via: [m] });
    return make(bendAt(from, to, bend, m => shapePoints(a, b, make(m)), obstacles, margin));
  };
  const l = (first: Axis): RouteShape => ({ exit: first, enter: flip(first), via: [] });
  const nearlySide = gy < gx * ELBOW_Z_RATIO, nearlyStack = gx < gy * ELBOW_Z_RATIO;
  if (exit && enter) return exit === enter ? z(exit) : l(exit);
  if (exit === "horizontal") return nearlySide ? z("horizontal") : l("horizontal");
  if (exit === "vertical") return nearlyStack ? z("vertical") : l("vertical");
  if (enter === "horizontal") return nearlySide ? z("horizontal") : l("vertical");
  if (enter === "vertical") return nearlyStack ? z("vertical") : l("horizontal");
  if (nearlySide) return z("horizontal");
  if (nearlyStack) return z("vertical");
  return l(gx >= gy ? "horizontal" : "vertical");
}

// Z 字の中棒を置く位置（向き合う 2 辺 from〜to の間）。bend があればその割合（両端に余白を残す）。
// 無ければ真ん中。真ん中だと線がほかの箱を通るなら、真ん中から外へ BEND_STEP ずつ試し、通らない一番近い位置。どこも通るなら真ん中
function bendAt(from: number, to: number, bend: number | null, points: (m: number) => Pt[] | null, obstacles: Rect[], margin: number): number {
  const lo = Math.min(from, to) + margin, hi = Math.max(from, to) - margin;
  const mid = (from + to) / 2;
  if (hi < lo) return mid;
  if (bend != null) return Math.min(hi, Math.max(lo, from + (to - from) * bend));
  const clear = (m: number) => {
    const pts = points(m);
    return !!pts && !obstacles.some(o => passes(pts, o));
  };
  for (let d = 0; mid - d >= lo || mid + d <= hi; d += BEND_STEP) {
    if (mid + d <= hi && clear(mid + d)) return mid + d;
    if (d && mid - d >= lo && clear(mid - d)) return mid - d;
  }
  return mid;
}
