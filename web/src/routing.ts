// 線の道筋（点の並び）を決める。画面に依存しない純粋な関数（docs/ROUTE-plan.md、docs/ARCH-plan.md）。
// 折れ線は、始点の箱から出る向き（exit）、終点の箱に入る向き（enter）、途中の区間の位置の並び（via）で表す:
//   始点の箱から exit の向きに出て、via の順に縦と横の区間を交互に置き、最後に enter の向きで終点の箱に入る。
//   via の 1 つ目は、出た区間と交わる向きの区間の位置（exit が横なら縦の区間の x 座標、2 つ目は横の区間の y 座標、…）。
//   exit と enter が同じ向きなら via は奇数個、違えば偶数個（0 個が L 字）。出る辺（左か右か）は via の位置から決まる。
// 自動の道筋（Z 字・L 字・コの字）も、この形を作ってから点の並びにする。手で直した via は、引けるあいだはそのまま使う
// 両端の位置（exitAt / enterAt）は、直線でも折れ線でも、出入りする辺の上の割合（0〜1）。無ければ自動（折れ線は辺の真ん中）

import type { Arrangement, Axis } from "./types";

import { type Pt, type Rect, pointAt, segmentThroughRect } from "./geom";
import { perimeter } from "./selfloop";

export type { Pt, Rect };

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
  exitAt?: number | null;  // 始点の位置（出る辺の上の割合。null は自動。直線は borderPath、折れ線は sidePath）
  enterAt?: number | null; // 終点の位置
  prevFrame?: string | null; // 前に描いたときの端の位置の基準（EndPaths の frame。変わったら端の位置を自動に戻す）
  aVertex?: boolean;      // 始点の端を、辺の真ん中（ひし形の頂点）に限る。exitAt は、箱のふちを左上から一周した割合で、
                          // 一番近い頂点を選ぶのに使う（無ければ自動。自分に戻る線と同じ持ち方。selfloop.ts の perimeter）
  bVertex?: boolean;      // 終点の端を、辺の真ん中に限る（enterAt は同じく頂点の選択）
}

// 直線でつなぐ相手のいる向き（始点から見て）。斜めなら "ne" は右上、"se" は右下、"sw" は左下、"nw" は左上。
// 横か縦に並ぶなら "e" は右、"s" は下、"w" は左、"n" は上
export type Facing = "ne" | "se" | "sw" | "nw" | "e" | "s" | "w" | "n";

// 両端の位置をずらせるとき、その基準。exit / enter は端が動ける道（割合 0〜1 で測る）。
// frame は基準の名前（直線は相手の向き Facing、折れ線は "elbow:" と出る辺・入る辺。例 "elbow:rt"）。変わったら端の位置を自動に戻す
export interface EndPaths { frame: string; exit: Pt[]; enter: Pt[] }

// 箱の辺。"t" は上、"r" は右、"b" は下、"l" は左
export type Side = "t" | "r" | "b" | "l";

// データに書き戻すこと（描画の側ではデータを書き換えない。graph が受け取って直す）
export interface RouteFix {
  clearDirections?: boolean; // 向きの指定を消す（横か縦に並ぶのに、両端の向きがそろわない）
  clearVia?: boolean;        // 手で直した via を消す（もう引けない、直線になった）
  clearBend?: boolean;       // 以前の bend を消す
  migrate?: RouteShape;           // 以前の bend を、この形として書き込む（bend は消す）
  clearAt?: boolean;         // 端の位置（exitAt / enterAt）を消す（箱が重なった、端の位置の基準が変わった）
}

export interface Route {
  points: Pt[];
  arrangement: Arrangement;
  shape: RouteShape | null;  // 折れ線の形（直線や、まっすぐに並ぶ箱どうしなら null）
  segments: Segment[];  // ドラッグで動かせる途中の区間
  ends: EndPaths | null; // 両端の位置をずらせるとき、その基準（重なった箱どうしなら null）
  through: boolean; // 描いた線がほかの箱（obstacles）を通るか（避ける道が見つからなかった、直線、手で直した形。配置の戦略が箱を動かし直す手がかり）
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

// 点の並びのどこかの区間が、矩形の内側を通るか（縁に触れるだけのものは数えない）。
// 縦か横の区間は、区間を囲む矩形との重なりで見る。斜めの区間（直線や、形を作れなかったときの中心どうしの線）は、
// 囲む矩形で見ると角の近くを通るだけで通ると数えてしまうので、線そのもので見る
export function passes(pts: Pt[], r: Rect) {
  const x0 = r.x + 1, y0 = r.y + 1, x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
  return pts.slice(1).some(([qx, qy], i) => {
    const [px, py] = pts[i]!;
    if (px !== qx && py !== qy) return segmentThroughRect([[px, py], [qx, qy]], r);
    return Math.max(px, qx) > x0 && Math.min(px, qx) < x1 && Math.max(py, qy) > y0 && Math.min(py, qy) < y1;
  });
}

// 形（exit / enter / via）から点の並びを作る。引けない（出る区間が始点の箱の中へ向かう、入る区間が終点の箱の中から来る、
// 線が両端の箱の中を通る、via の数が向きと合わない）なら null
export function shapePoints(a: Rect, b: Rect, s: RouteShape, at: EndsAt = NO_AT): Pt[] | null {
  const { exit, enter, via } = s;
  if ((exit === enter) !== (via.length % 2 === 1)) return null;
  // 出る辺・入る辺の上の位置（出る向きが横なら y、縦なら x）
  const as = endCoord(a, exit, at.exitAt), bs = endCoord(b, enter, at.enterAt);
  // 出る辺: 最初に向かう位置が、始点の箱のどちら側にあるか
  const first = via.length ? via[0]! : bs;
  let c: Pt;
  if (exit === "horizontal") {
    if (first >= a.x + a.w) c = [a.x + a.w, as];
    else if (first <= a.x) c = [a.x, as];
    else return null;
  } else {
    if (first >= a.y + a.h) c = [as, a.y + a.h];
    else if (first <= a.y) c = [as, a.y];
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
    c = [c[0], bs];
    pts.push(c);
    if (c[0] <= b.x) pts.push([b.x, bs]);
    else if (c[0] >= b.x + b.w) pts.push([b.x + b.w, bs]);
    else return null;
  } else {
    c = [bs, c[1]];
    pts.push(c);
    if (c[1] <= b.y) pts.push([bs, b.y]);
    else if (c[1] >= b.y + b.h) pts.push([bs, b.y + b.h]);
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
export function simplifyVia(a: Rect, b: Rect, s: RouteShape, at: EndsAt = NO_AT): number[] {
  const via = [...s.via];
  // i 番目の区間は、前の位置から次の位置までのびる。前は 1 つ前の値（無ければ始点の出る位置）、次は 1 つ後の値（無ければ終点の入る位置）
  const startOf = () => endCoord(a, s.exit, at.exitAt);
  const endOf = () => endCoord(b, s.enter, at.enterAt);
  for (let changed = true; changed && via.length > 1;) {
    changed = false;
    for (let i = 0; i < via.length; i++) {
      const prev = i > 0 ? via[i - 1]! : startOf();
      const next = i < via.length - 1 ? via[i + 1]! : endOf();
      if (Math.abs(prev - next) > 0.5) continue;
      via.splice(i + 1 < via.length ? i : i - 1, 2);
      changed = true;
      break;
    }
  }
  return via;
}

// 線の道筋を決める。端の位置（exitAt / enterAt）は、基準（EndPaths の frame）が前に描いたときと変わったら使わずに自動に戻す。
// 端を頂点に限る箱（ひし形）は、端の位置を使わず、辺の真ん中から出入りする（折れ線は自動でそうなる。直線は toVertices で寄せる）
export function route(input: RouteInput): Route {
  // 頂点に限る端は、辺の真ん中（頂点）に固定する。折れ線は端の位置を使わなければ辺の真ん中から出入りするので、普通の箱と同じ仕組みで引く
  // （向きの指定・途中の区間・相手の端の位置がそのまま効く）。どの辺から出入りするかは形（exit / enter / via）で決まり、
  // 端をつまんで別の頂点へ動かしたときは vertexShape の形を書き込む（edge-drag.ts）。
  // 直線は、exitAt / enterAt を箱のふちを一周した割合として、一番近い頂点を選ぶのに使う（toVertices）
  const choice = {
    a: !input.elbow ? pickSide(input.aVertex, input.exitAt, input.a) : null,
    b: !input.elbow ? pickSide(input.bVertex, input.enterAt, input.b) : null,
  };
  const r = { ...input, exitAt: input.aVertex ? null : input.exitAt, enterAt: input.bVertex ? null : input.enterAt };
  const hasAt = r.exitAt != null || r.enterAt != null;
  const first = keepSides(routeWith(r, { exitAt: r.exitAt ?? null, enterAt: r.enterAt ?? null }), r, { exitAt: r.exitAt ?? null, enterAt: r.enterAt ?? null });
  let out = first;
  if (hasAt && !first.fix.clearAt && r.prevFrame && first.ends && first.ends.frame !== r.prevFrame) {
    out = routeWith(r, NO_AT);
    out.fix.clearAt = true;
  }
  if (r.aVertex || r.bVertex) toVertices(out, r, choice);
  out.through = r.obstacles.some(o => passes(out.points, o));
  return out;
}

// 前に描いたときの出入りする辺を保つ形で引くときの、折れ目の数の上限
export const STICKY_BENDS = 3;

// 手で直していない折れ線は、前に描いたときに出入りした辺（prevFrame "elbow:<出る辺><入る辺>"）を保つ。その辺のまま、折れ目
// STICKY_BENDS 以内で、ほかの箱を通らずに引ける形があればそれを使う（箱を動かしても、端を別の辺へ動かすより折れ目を増やす。
// 2026-10-10 ユーザー）。無ければ一番よい形のまま（以後はその辺を保つ）。向きの指定と合わない辺なら保たない。
// ドラッグで箱の入れ替えが起きたときは、描く側が prevFrame を消して一番よい形に選び直させる（graph.ts の resetRoutes）
function keepSides(out: Route, r: RouteInput, at: EndsAt): Route {
  const f = r.prevFrame;
  if (!r.elbow || r.via || !f || !f.startsWith("elbow:") || f.length !== 8 || out.arrangement === "overlap") return out;
  if (out.ends?.frame === f) return out;
  const s = f[6] as Side, t = f[7] as Side;
  const ax = axisOfSide(s), bx = axisOfSide(t);
  if ((r.exit && r.exit !== ax) || (r.enter && r.enter !== bx)) return out;
  const best = pickCandidate(candidatesWith(r, at, ax, bx, STICKY_BENDS)
    .filter(c => sideOf(r.a, c.points[0]!) === s && sideOf(r.b, c.points[c.points.length - 1]!) === t));
  if (!best) return out;
  return {
    ...out, points: best.points, shape: best.shape, segments: segmentsOf(r.a, r.b, best.shape, r.margin),
    ends: elbowEnds(r.a, r.b, ax, bx, best.points),
  };
}

// 頂点に限る端の、選んだ頂点の辺（exitAt / enterAt を箱のふちを一周した割合として読む。無ければ null）
const pickSide = (vertex: boolean | undefined, at: number | null | undefined, rect: Rect): Side | null =>
  vertex && at != null ? sideOf(rect, pointAt(perimeter(rect), at)) : null;

// 箱 r の、点 p に一番近い辺
export function sideOf(r: Rect, p: Pt): Side {
  const d = [Math.abs(p[1] - r.y), Math.abs(p[0] - (r.x + r.w)), Math.abs(p[1] - (r.y + r.h)), Math.abs(p[0] - r.x)];
  return (["t", "r", "b", "l"] as const)[d.indexOf(Math.min(...d))]!;
}

// 辺の真ん中（ひし形の頂点）
function vertexAt(r: Rect, side: Side): Pt {
  return side === "t" ? [r.x + r.w / 2, r.y] : side === "r" ? [r.x + r.w, r.y + r.h / 2]
    : side === "b" ? [r.x + r.w / 2, r.y + r.h] : [r.x, r.y + r.h / 2];
}

// 箱 r の、点 p に一番近い辺の真ん中（ひし形の頂点）
export function vertexOf(r: Rect, p: Pt): Pt {
  return vertexAt(r, sideOf(r, p));
}

const axisOfSide = (side: Side): Axis => (side === "l" || side === "r" ? "horizontal" : "vertical");

// 頂点に限る端の後始末。直線（2 点）は、頂点（選んでいればその頂点）に寄せ、相手が普通の箱で端の位置を決めていなければ、相手の端を合わせる
// （横に並ぶなら同じ高さ、縦に並ぶなら同じ横位置でまっすぐ。斜めなら相手の中心から頂点へ向かう線が相手の縁と交わる点）。
// 選んだ頂点で引くと両端の箱の中を通るなら、選ばなかったことにする。折れ線はもう辺の真ん中から出入りしている。
// 端の基準（ends）は、頂点に限る端ではふち一周の道にする（端をつまんで別の頂点へ動かせる。離した所に一番近い頂点を選ぶ）
function toVertices(out: Route, r: RouteInput, choice: { a: Side | null; b: Side | null }) {
  const { a, b } = r;
  if (out.points.length === 2) {
    const place = (ca: Side | null, cb: Side | null): [Pt, Pt] => {
      let [p, q] = out.points as [Pt, Pt];
      if (r.aVertex) p = ca ? vertexAt(a, ca) : vertexOf(a, p);
      if (r.bVertex) q = cb ? vertexAt(b, cb) : vertexOf(b, q);
      // 相手が普通の箱で端の位置を決めていなければ: 折れ線は相手の辺の真ん中に固定する（ひし形を動かしても相手の端が動かないように。
      // そろわなければ下で折れて結ぶ。2026-10-10 ユーザー）。直線は相手の端をこちらの頂点へ向ける
      if (r.aVertex && !r.bVertex && r.enterAt == null) q = r.elbow ? vertexOf(b, q) : facePoint(b, q, p, out.arrangement);
      if (r.bVertex && !r.aVertex && r.exitAt == null) p = r.elbow ? vertexOf(a, p) : facePoint(a, p, q, out.arrangement);
      return [p, q];
    };
    let pts = place(choice.a, choice.b);
    if ((choice.a || choice.b) && (passes(pts, a) || passes(pts, b))) pts = place(null, null);
    out.points = pts;
    // 折れ線なのに、頂点へ寄せたら両端がまっすぐにそろわない（相手の端を辺の真ん中に固定した、ずらしてある、など）なら、
    // 向きの指定のまま折れて結ぶ形を、折れ目 STICKY_BENDS 以内で探す（斜めの線にしない）。見つからなければ（箱どうしが近くて
    // 折る余白が無い、など）、相手の端をこちらの頂点にそろえてまっすぐにする（端を動かす。遠回りの線にしない）。
    // 相手の端の位置をずらしてあって動かせないときだけ、折れ目の多い形も使う。重なっている箱どうし（ドラッグ中）は中心どうしの線のまま
    const [p, q] = pts;
    if (r.elbow && out.arrangement !== "overlap" && p[0] !== q[0] && p[1] !== q[1]) {
      // 向きは箱の並び方で決める（縦に並ぶなら上下、横に並ぶなら左右。斜めなら離れている方）
      const axis: Axis = out.arrangement === "stack" ? "vertical" : out.arrangement === "side" ? "horizontal"
        : Math.abs(p[0] - q[0]) < Math.abs(p[1] - q[1]) ? "vertical" : "horizontal";
      const at = { exitAt: r.exitAt ?? null, enterAt: r.enterAt ?? null };
      const find = (obstacles: Rect[], maxBends: number) =>
        pickCandidate(candidatesWith({ ...r, obstacles }, at, r.exit ?? axis, r.enter ?? axis, maxBends, true));
      let best = find(r.obstacles, STICKY_BENDS) ?? find([], STICKY_BENDS);
      if (!best) {
        let [fp, fq] = pts;
        if (r.aVertex && !r.bVertex && r.enterAt == null) fq = facePoint(b, fq, fp, out.arrangement);
        if (r.bVertex && !r.aVertex && r.exitAt == null) fp = facePoint(a, fp, fq, out.arrangement);
        if (fp[0] === fq[0] || fp[1] === fq[1]) {
          out.points = [fp, fq];
          best = null;
        } else {
          best = find(r.obstacles, MAX_BENDS) ?? find([], MAX_BENDS);
        }
      }
      if (best) {
        out.points = best.points;
        out.shape = best.shape;
        out.segments = segmentsOf(a, b, best.shape, r.margin);
      }
    }
  }
  if (out.ends) {
    if (r.aVertex) out.ends = { ...out.ends, exit: perimeter(a) };
    if (r.bVertex) out.ends = { ...out.ends, enter: perimeter(b) };
  }
}

// 折れ線の端（頂点に限る箱の側）を、辺 side の頂点から出入りさせる形。もう一方の端の向きの指定と位置はそのまま使う。
// ほかの箱を通らない形を、折れ目の少ない方から（無ければ通る形でも）。引けなければ null。端をつまんで別の頂点へ動かしたとき、
// これを手で直した形として書き込む（以後は普通の線と同じく、向きの指定や途中の区間のドラッグが効く）
// keep は、もう一方の端が今出入りしている辺（あればその辺を保つ形を先に探す。向きだけでなく左右・上下のどちら側かも変えないため）
export function vertexShape(input: RouteInput, end: "exit" | "enter", side: Side, keep: Side | null = null): RouteShape | null {
  const r = { ...input, exitAt: input.aVertex ? null : input.exitAt, enterAt: input.bVertex ? null : input.enterAt };
  const at = { exitAt: r.exitAt ?? null, enterAt: r.enterAt ?? null };
  // もう一方の端は、今の辺（keep）を保つ形を先に探す。無ければ向きの指定だけ保ち、それも無ければ向きも縛らずに探す
  const ends = (pts: Pt[]) => end === "exit"
    ? [sideOf(r.a, pts[0]!), sideOf(r.b, pts[pts.length - 1]!)] : [sideOf(r.b, pts[pts.length - 1]!), sideOf(r.a, pts[0]!)];
  const find = (other: Axis | null, obstacles: Rect[], keepSide: Side | null) => {
    const fixed: [Axis | null, Axis | null] = end === "exit" ? [axisOfSide(side), other] : [other, axisOfSide(side)];
    return pickCandidate(candidatesWith({ ...r, obstacles }, at, fixed[0], fixed[1]).filter(c => {
      const [mine, theirs] = ends(c.points);
      return mine === side && (!keepSide || theirs === keepSide);
    }));
  };
  const other = end === "exit" ? r.enter : r.exit;
  const keepAxis = keep ? axisOfSide(keep) : other;
  return (find(keepAxis, r.obstacles, keep) ?? find(keepAxis, [], keep) ??
    find(other, r.obstacles, null) ?? find(other, [], null) ?? find(null, r.obstacles, null) ?? find(null, [], null))?.shape ?? null;
}

// 普通の箱 r の端 q を、相手の頂点 v に向けて置き直す
function facePoint(r: Rect, q: Pt, v: Pt, arr: string): Pt {
  if (arr === "side" && v[1] >= r.y && v[1] <= r.y + r.h) return [q[0], v[1]];
  if (arr === "stack" && v[0] >= r.x && v[0] <= r.x + r.w) return [v[0], q[1]];
  const [cx, cy] = center(r);
  return clipToRect(cx, cy, r.w, r.h, v[0] - cx, v[1] - cy);
}

function routeWith(r: RouteInput, at: EndsAt): Route {
  const { a, b } = r;
  const arrangement = arrangementOf(a, b);
  const fix: RouteFix = {};
  const [acx, acy] = center(a), [bcx, bcy] = center(b);
  const hasAt = at.exitAt != null || at.enterAt != null;
  const plain = (points: Pt[], ends: EndPaths | null): Route => {
    if (r.via) fix.clearVia = true;
    if (r.bend != null) fix.clearBend = true;
    if (hasAt && !ends) fix.clearAt = true;
    return { points, arrangement, shape: null, segments: [], ends, through: false, fix };
  };
  const drawn = (shape: RouteShape, points: Pt[]): Route =>
    ({ points, arrangement, shape, segments: segmentsOf(a, b, shape, r.margin), ends: elbowEnds(a, b, shape.exit, shape.enter, points), through: false, fix });
  // 自動の形がほかの箱を通るなら、通らない形を折れ目の少ない方から探す（段階 5）。見つからなければ自動の形のまま
  const avoided = (pts: Pt[], fixed: [Axis | null, Axis | null]): Route | null => {
    if (!r.obstacles.some(o => passes(pts, o))) return null;
    const best = pickCandidate(candidatesWith(r, at, fixed[0], fixed[1], MAX_BENDS, true));
    if (!best) return null;
    if (r.bend != null) fix.clearBend = true;
    return drawn(best.shape, best.points);
  };

  if (arrangement === "overlap") {
    return plain([clipToRect(acx, acy, a.w, a.h, bcx - acx, bcy - acy), clipToRect(bcx, bcy, b.w, b.h, acx - bcx, acy - bcy)], null);
  }
  if (!r.elbow) {
    // 直線。端の位置があれば、相手に向いた側の辺の上のその位置から。
    // 無ければ、斜めなら中心どうしを結ぶ線、横か縦に並ぶなら重なる範囲の真ん中をまっすぐ
    const [p0, q0] = arrangement === "diagonal"
      ? [clipToRect(acx, acy, a.w, a.h, bcx - acx, bcy - acy), clipToRect(bcx, bcy, b.w, b.h, acx - bcx, acy - bcy)]
      : alignedPoints(a, b, arrangement) as [Pt, Pt];
    const ends = { frame: facingOf(a, b), exit: borderPath(a, b), enter: borderPath(b, a) };
    const p = at.exitAt != null ? pointAt(ends.exit, at.exitAt) : p0;
    const q = at.enterAt != null ? pointAt(ends.enter, at.enterAt) : q0;
    return plain([p, q], ends);
  }

  // 横か縦に並ぶ箱どうしで、両端の向きの指定がそろわないときは、その組み合わせで引ける形を候補から探す（折れ目の少ない方。
  // 手で直した形があればそちらが先）。引けなければ、指定を両方とも自動に戻す（2026-10-10 ユーザー。以前はそろわない指定を許さなかった）
  let { exit, enter } = r;
  if ((arrangement === "side" || arrangement === "stack") && exit && enter && exit !== enter && !r.via) {
    const find = (obstacles: Rect[]) => pickCandidate(candidatesWith({ ...r, obstacles }, at, exit, enter, MAX_BENDS, true));
    const best = find(r.obstacles) ?? find([]);
    if (best) {
      if (r.bend != null) fix.clearBend = true;
      return drawn(best.shape, best.points);
    }
    fix.clearDirections = true;
    exit = enter = null;
  }

  // 手で直した形。引けるあいだはそのまま使う。引けなくなったら消して、向きの指定も消して自動に戻す（最適な形に変わる方へ寄せる）
  if (r.via) {
    if (exit && enter) {
      const shape = { exit, enter, via: r.via };
      const pts = shapePoints(a, b, shape, at);
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
      const pts = shapePoints(a, b, shape, at) ?? alignedPoints(a, b, arrangement);
      return avoided(pts, [exit, enter]) ?? drawn(shape, pts);
    }
    if (r.bend != null) fix.clearBend = true;
    const along = flip(across);
    if (hasAt) {
      // 端をずらしたら、向き合う辺の間の真ん中で折る Z 字（両端の高さがそろえば、まっすぐと同じ）
      const shape: RouteShape = { exit: along, enter: along, via: [zMiddle(a, b, along)] };
      const pts = shapePoints(a, b, shape, at);
      if (pts) return avoided(pts, [exit, enter]) ?? drawn(shape, pts);
    }
    const pts = alignedPoints(a, b, arrangement);
    return avoided(pts, [exit, enter]) ??
      { points: pts, arrangement, shape: null, segments: [], ends: elbowEnds(a, b, along, along, pts), through: false, fix };
  }

  const shape = elbowShape(a, b, exit, enter, r.bend, r.obstacles, r.margin, at);
  const pts = shapePoints(a, b, shape, at) ?? [[acx, acy], [bcx, bcy]];
  const other = avoided(pts, [exit, enter]);
  if (other) return other;
  if (r.bend != null) {
    if (shape.via.length === 1) fix.migrate = shape;
    else fix.clearBend = true;
  }
  return drawn(shape, pts);
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
function elbowShape(
  a: Rect, b: Rect, exit: Axis | null, enter: Axis | null, bend: number | null, obstacles: Rect[], margin: number, at: EndsAt,
): RouteShape {
  const [acx, acy] = center(a), [bcx, bcy] = center(b);
  // 向き合う辺（a の出る辺と b の入る辺）の位置
  const ax = bcx > acx ? a.x + a.w : a.x, bx = bcx > acx ? b.x : b.x + b.w;
  const ay = bcy > acy ? a.y + a.h : a.y, by = bcy > acy ? b.y : b.y + b.h;
  const gx = Math.abs(bx - ax), gy = Math.abs(by - ay);
  const z = (axis: Axis): RouteShape => {
    const [from, to] = axis === "horizontal" ? [ax, bx] : [ay, by];
    const make = (m: number): RouteShape => ({ exit: axis, enter: axis, via: [m] });
    return make(bendAt(from, to, bend, m => shapePoints(a, b, make(m), at), obstacles, margin));
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

// ---- 直線の端の位置（docs/EDGE-plan.md の段階 9） ----

// 始点 r から見た、相手 o のいる向き（横か縦に並ぶなら 4 方向、斜めなら 4 象限）
export function facingOf(r: Rect, o: Rect): Facing {
  const [rx, ry] = center(r), [ox, oy] = center(o);
  const arr = arrangementOf(r, o);
  if (arr === "side") return ox >= rx ? "e" : "w";
  if (arr === "stack") return oy >= ry ? "s" : "n";
  return ox >= rx ? (oy >= ry ? "se" : "ne") : (oy >= ry ? "sw" : "nw");
}

// 箱 r の、相手 o に向いた側の辺を角から角までたどる道。斜めなら 3 点（真ん中が相手に向いた角）。
// 横か縦に並ぶなら、相手に向いた 1 辺の 2 点（横に並ぶなら上の角から下の角、縦に並ぶなら左の角から右の角。両端とも 0 なら上の角どうし
// か左の角どうしを結ぶ線）。
// 端の位置の割合 0 と 1 は、両方の箱で同じ側の角になる（相手が右上か左下なら、0 が左上の角、1 が右下の角。右下か左上なら、0 が右上、1 が左下）。
// そのため、両端とも 0 なら左上の角どうし（か右上どうし）、両端とも 1 なら右下の角どうし（か左下どうし）を結ぶ線になる。これがずらせる範囲の両端
export function borderPath(r: Rect, o: Rect): Pt[] {
  const tl: Pt = [r.x, r.y], tr: Pt = [r.x + r.w, r.y], br: Pt = [r.x + r.w, r.y + r.h], bl: Pt = [r.x, r.y + r.h];
  switch (facingOf(r, o)) {
    case "sw": return [tl, bl, br];
    case "ne": return [tl, tr, br];
    case "se": return [tr, br, bl];
    case "nw": return [tr, tl, bl];
    case "e": return [tr, br];
    case "w": return [tl, bl];
    case "s": return [bl, br];
    case "n": return [tl, tr];
  }
}



// ---- 折れ線の端の位置（docs/EDGE-plan.md の段階 4） ----

export interface EndsAt { exitAt: number | null; enterAt: number | null }
const NO_AT: EndsAt = { exitAt: null, enterAt: null };

// 箱 r から axis の向きに出入りするときの、辺の上の位置（横なら y、縦なら x）。at があれば辺の上の割合、無ければ真ん中
function endCoord(r: Rect, axis: Axis, at: number | null): number {
  return axis === "horizontal" ? r.y + r.h * (at ?? 0.5) : r.x + r.w * (at ?? 0.5);
}

// 辺を角から角までたどる道。左右の辺は上から下、上下の辺は左から右（割合 0 が上か左の角）
export function sidePath(r: Rect, side: Side): Pt[] {
  const tl: Pt = [r.x, r.y], tr: Pt = [r.x + r.w, r.y], br: Pt = [r.x + r.w, r.y + r.h], bl: Pt = [r.x, r.y + r.h];
  return side === "t" ? [tl, tr] : side === "r" ? [tr, br] : side === "b" ? [bl, br] : [tl, bl];
}

// 点 p が、箱 r の axis の向きに出入りする辺のどちらにあるか（角にあっても向きで決まる）
function sideAt(r: Rect, axis: Axis, p: Pt): Side {
  return axis === "horizontal" ? (p[0] >= r.x + r.w ? "r" : "l") : (p[1] >= r.y + r.h ? "b" : "t");
}

// 折れ線の両端の基準: 出る辺・入る辺と、その辺の道
function elbowEnds(a: Rect, b: Rect, exit: Axis, enter: Axis, pts: Pt[]): EndPaths {
  const s = sideAt(a, exit, pts[0]!), t = sideAt(b, enter, pts[pts.length - 1]!);
  return { frame: `elbow:${s}${t}`, exit: sidePath(a, s), enter: sidePath(b, t) };
}

// 横（縦）に並ぶ箱どうしの、向き合う辺の間の真ん中
function zMiddle(a: Rect, b: Rect, along: Axis): number {
  if (along === "horizontal") return a.x < b.x ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
  return a.y < b.y ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
}

// ---- ほかの箱を避ける（docs/EDGE-plan.md の段階 5） ----
// 線の側の決まり: 自動の形（route）がほかの箱を通るときだけ、通らない形を探して使う（pickCandidate）。
// 配置の戦略（段階 6）が使えるよう、候補の列挙（routeCandidates）は、箱の矩形だけで動く純粋な関数にしてある。戦略は、候補の
// 尺度（折れ目の数、長さ、ほかの箱との余白）で別の候補を選び、その形を exit / enter / via として書き込めば、手で直した形と同じく保たれる

// 折れ線の候補。bends は折れ目の数、length は長さ、clearance はほかの箱との一番近い距離（ほかの箱が無ければ Infinity）
export interface Candidate { shape: RouteShape; points: Pt[]; bends: number; length: number; clearance: number }

// 探す折れ目の数の上限（L 字 1、Z 字・コの字 2、3、S 字 4）
export const MAX_BENDS = 4;

// ほかの箱を通らない折れ線の候補を、全部挙げる（順番は決まっているが、選ぶのは呼ぶ側。route は pickCandidate）。
// 向きの指定（exit / enter）があれば、それに合う形だけ。端の位置（exitAt / enterAt）はそのまま使う
export function routeCandidates(r: RouteInput, maxBends = MAX_BENDS): Candidate[] {
  return candidatesWith(r, { exitAt: r.exitAt ?? null, enterAt: r.enterAt ?? null }, r.exit, r.enter, maxBends);
}

// 線の側の選び方: 折れ目の少ない方、同じなら短い方、それも同じならほかの箱から離れた方（同じなら先に挙げた方）
export function pickCandidate(list: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of list) {
    if (!best || c.bends < best.bends) { best = c; continue; }
    if (c.bends > best.bends) continue;
    if (c.length < best.length - 0.5 || (Math.abs(c.length - best.length) <= 0.5 && c.clearance > best.clearance)) best = c;
  }
  return best;
}

// fewest が true なら、候補が見つかった折れ目の数で探すのをやめる（route が使う。折れ目の多い形まで全部試すと重いため）
// 道筋に関わりうるほかの箱だけを残す。候補の道はどれも、両端の箱の外 LOOP_DEPTH と、行く手の箱の脇 margin までの範囲に収まるので、
// その範囲に掛からない箱は結果を変えない。描画は、これで絞った入力を覚えておく鍵にする（ドラッグ中に遠くの箱が動いても探し直さない）
export function scopeObstacles(r: RouteInput): Rect[] {
  const { a, b, margin, obstacles } = r;
  const lo = { x: Math.min(a.x, b.x) - margin, y: Math.min(a.y, b.y) - margin };
  const hi = { x: Math.max(a.x + a.w, b.x + b.w) + margin, y: Math.max(a.y + a.h, b.y + b.h) + margin };
  const near = obstacles.filter(o => o.x < hi.x && o.x + o.w > lo.x && o.y < hi.y && o.y + o.h > lo.y);
  const d = Math.max(LOOP_DEPTH, margin);
  const x0 = Math.min(a.x - d, b.x - d, ...near.map(o => o.x - margin)), x1 = Math.max(a.x + a.w + d, b.x + b.w + d, ...near.map(o => o.x + o.w + margin));
  const y0 = Math.min(a.y - d, b.y - d, ...near.map(o => o.y - margin)), y1 = Math.max(a.y + a.h + d, b.y + b.h + d, ...near.map(o => o.y + o.h + margin));
  return obstacles.filter(o => o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0);
}

function candidatesWith(
  r: RouteInput, at: EndsAt, fixedExit: Axis | null, fixedEnter: Axis | null, maxBends = MAX_BENDS, fewest = false,
): Candidate[] {
  const { a, b, margin, obstacles } = r;
  // 途中の区間を置いてみる位置: 両端の箱の間の真ん中、両端の箱の外（LOOP_DEPTH）、行く手にあるほかの箱の脇（margin）
  const lo = { x: Math.min(a.x, b.x) - margin, y: Math.min(a.y, b.y) - margin };
  const hi = { x: Math.max(a.x + a.w, b.x + b.w) + margin, y: Math.max(a.y + a.h, b.y + b.h) + margin };
  const near = obstacles.filter(o => o.x < hi.x && o.x + o.w > lo.x && o.y < hi.y && o.y + o.h > lo.y);
  const coords = (k: "x" | "y"): number[] => {
    const size = k === "x" ? "w" : "h";
    const [p, q] = a[k] < b[k] ? [a, b] : [b, a];
    const set = [
      a[k] - LOOP_DEPTH, a[k] + a[size] + LOOP_DEPTH, b[k] - LOOP_DEPTH, b[k] + b[size] + LOOP_DEPTH,
      ...near.flatMap(o => [o[k] - margin, o[k] + o[size] + margin]),
    ];
    if (q[k] > p[k] + p[size]) set.push((p[k] + p[size] + q[k]) / 2);
    return [...new Set(set.map(v => Math.round(v)))];
  };
  const xs = coords("x"), ys = coords("y");
  const out: Candidate[] = [];
  const axes: Axis[] = ["horizontal", "vertical"];
  for (let k = 0; k + 1 <= maxBends; k++) {
    if (fewest && out.length) break;
    for (const exit of axes) {
      if (fixedExit && fixedExit !== exit) continue;
      for (const enter of axes) {
        if (fixedEnter && fixedEnter !== enter) continue;
        if ((exit === enter) !== (k % 2 === 1)) continue;
        const sets = Array.from({ length: k }, (_, i) => ((i % 2 === 0) === (exit === "horizontal") ? xs : ys));
        for (const via of product(sets)) {
          const shape = { exit, enter, via };
          const pts = shapePoints(a, b, shape, at);
          if (!pts || pts.length - 2 !== k + 1 || pts.some((p, i) => i >= 2 && straightJoint(pts[i - 2]!, pts[i - 1]!, p))) {
            continue; // 折れ目が重なるか、折れずにまっすぐ続く所がある（もっと折れ目の少ない形と同じ）
          }
          if (!roomy(pts, margin) || obstacles.some(o => passes(pts, o))) continue;
          out.push({ shape, points: pts, bends: k + 1, length: lengthOf(pts), clearance: clearanceOf(pts, obstacles) });
        }
      }
    }
  }
  return out;
}

// p → q → r が折れずにまっすぐ続くか
function straightJoint(p: Pt, q: Pt, r: Pt): boolean {
  return (p[0] === q[0] && q[0] === r[0]) || (p[1] === q[1] && q[1] === r[1]);
}

// 並びの組み合わせを全部（[[1, 2], [3]] なら [1, 3], [2, 3]）
function product(sets: number[][]): number[][] {
  return sets.reduce<number[][]>((acc, set) => acc.flatMap(p => set.map(v => [...p, v])), [[]]);
}

// 最初と最後の区間（箱から出る・入る区間）が margin 以上あるか（矢印が箱の角に詰まらないように）
function roomy(pts: Pt[], margin: number): boolean {
  const len = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
  return len(pts[0]!, pts[1]!) >= margin && len(pts[pts.length - 2]!, pts[pts.length - 1]!) >= margin;
}

function lengthOf(pts: Pt[]): number {
  return pts.slice(1).reduce((s, q, i) => s + Math.abs(q[0] - pts[i]![0]) + Math.abs(q[1] - pts[i]![1]), 0);
}

// 線とほかの箱の一番近い距離
function clearanceOf(pts: Pt[], obstacles: Rect[]): number {
  let best = Infinity;
  for (const o of obstacles) {
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1]!, pts[i]!];
      const dx = Math.max(o.x - Math.max(p[0], q[0]), 0, Math.min(p[0], q[0]) - (o.x + o.w));
      const dy = Math.max(o.y - Math.max(p[1], q[1]), 0, Math.min(p[1], q[1]) - (o.y + o.h));
      best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best;
}
