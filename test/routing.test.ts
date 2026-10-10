// routing.ts のテスト。線の道筋を、画面を作らずに確かめる（docs/ROUTE-plan.md、docs/EDGE-SPEC.md）
import { expect, test } from "bun:test";
import { type RouteInput, alignedEnds, passes, routeCandidates, scopeObstacles, route, segmentsOf, shapePoints, simplifyVia } from "../web/src/routing";
import { type Pt, type Rect, nearestAt } from "../web/src/geom";
import { perimeter } from "../web/src/selfloop";

// a: 40〜160 × 40〜104（中心 100, 72）、b: 400〜520 × 300〜364（中心 460, 332）
const a = { x: 40, y: 40, w: 120, h: 64 }, b = { x: 400, y: 300, w: 120, h: 64 };
const input = (o: Partial<RouteInput> = {}): RouteInput =>
  ({ a, b, elbow: true, via: null, obstacles: [], margin: 12, ...o });
// 箱 r のふちの上の点 (x, y) の、ふち一周の割合（固定の端の値）
const P = (r: Rect, x: number, y: number) => nearestAt(perimeter(r), x, y);
// 割合から戻した点は小数の誤差を持つ（書く割合は小数 4 桁）ので、比べる前に小数 1 桁へ丸める
const round = (pts: Pt[]) => pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
// 両端を、a の右の辺の真ん中と b の左の辺の真ん中に固定（手で直した via を持てる）
const fixedZ = { exitAt: P(a, 160, 72), enterAt: P(b, 400, 332) };
// 縦か横の区間だけでできているか（斜めの線が無いか）
const orthogonal = (pts: Pt[]) => pts.slice(1).every((q, i) => q[0] === pts[i]![0] || q[1] === pts[i]![1]);

test("形から点の並びを作る: L 字（via なし）、Z 字、コの字、S 字", () => {
  expect(shapePoints(a, b, { exit: "horizontal", enter: "vertical", via: [] })).toEqual([[160, 72], [460, 72], [460, 300]]);
  expect(shapePoints(a, b, { exit: "horizontal", enter: "horizontal", via: [280] })).toEqual([[160, 72], [280, 72], [280, 332], [400, 332]]);
  // x = 560 は両方の箱の右の外。a の右から出て、b の右へ入る
  expect(shapePoints(a, b, { exit: "horizontal", enter: "horizontal", via: [560] })).toEqual([[160, 72], [560, 72], [560, 332], [520, 332]]);
  expect(shapePoints(a, b, { exit: "horizontal", enter: "horizontal", via: [200, 180, 300] }))
    .toEqual([[160, 72], [200, 72], [200, 180], [300, 180], [300, 332], [400, 332]]);
});

test("引けない形は null: via の数が向きと合わない、出る位置が箱の中、線が箱の中を通る", () => {
  expect(shapePoints(a, b, { exit: "horizontal", enter: "horizontal", via: [] })).toBeNull();
  expect(shapePoints(a, b, { exit: "horizontal", enter: "vertical", via: [280] })).toBeNull();
  expect(shapePoints(a, b, { exit: "horizontal", enter: "horizontal", via: [100] })).toBeNull(); // a の中
  expect(shapePoints(a, b, { exit: "horizontal", enter: "horizontal", via: [460] })).toBeNull(); // b の中から入る
});

test("動かせる区間の範囲: 最初の区間は始点の箱の外、最後の区間は終点の箱の外（margin 空ける）、途中は自由", () => {
  expect(segmentsOf(a, b, { exit: "horizontal", enter: "horizontal", via: [280] }, 12))
    .toEqual([{ index: 0, axis: "x", lo: 172, hi: 388 }]);
  expect(segmentsOf(a, b, { exit: "horizontal", enter: "horizontal", via: [200, 180, 300] }, 12)).toEqual([
    { index: 0, axis: "x", lo: 172, hi: Infinity },
    { index: 1, axis: "y", lo: -Infinity, hi: Infinity },
    { index: 2, axis: "x", lo: -Infinity, hi: 388 },
  ]);
});

test("長さ 0 の区間の折れ目をまとめる", () => {
  // 真ん中の横の区間が 0（x1 = x2）
  expect(simplifyVia(a, b, { exit: "horizontal", enter: "horizontal", via: [200, 180, 200] })).toEqual([200]);
  // 最初の縦の区間が 0（y = 始点の中心の高さ 72）
  expect(simplifyVia(a, b, { exit: "horizontal", enter: "horizontal", via: [200, 72, 300] })).toEqual([300]);
  // まとめるものが無ければそのまま
  expect(simplifyVia(a, b, { exit: "horizontal", enter: "horizontal", via: [200, 180, 300] })).toEqual([200, 180, 300]);
});

test("route: 手で直した via は、両端が固定のときだけ使う。引けなければ、または端が自由なら、消すよう知らせる", () => {
  const r = route(input({ ...fixedZ, via: [280] }));
  expect([round(r.points), r.fix]).toEqual([[[160, 72], [280, 72], [280, 332], [400, 332]], {}]);
  expect(route(input({ ...fixedZ, via: [100] })).fix).toEqual({ clearVia: true }); // a の中を通る
  expect(route(input({ via: [280] })).fix).toEqual({ clearVia: true });            // 端が自由
  expect(route(input({ ...fixedZ, via: [560] })).fix).toEqual({ clearVia: true }); // 固定の辺（b の左）と違う辺から入る
});

test("route: 直線には via を使わず、消すよう知らせる", () => {
  const r = route(input({ elbow: false, via: [280] }));
  expect([r.points.length, r.fix]).toEqual([2, { clearVia: true }]);
});

test("直線: 固定の端はその点から。自由な端は相手の端へ向ける（横に並べばまっすぐ、斜めなら相手の中心から）", () => {
  const r = route(input({ elbow: false, exitAt: P(a, 132, 104) }));
  expect(round(r.points)[0]).toEqual([132, 104]);
  // 自由な b の端は、b の中心から固定の点へ向かう線と b の縁の交点
  const [qx, qy] = r.points[1]!;
  expect((qy - 332) / (qx - 460)).toBeCloseTo((104 - 332) / (132 - 460), 5);
  const side = { x: 400, y: 40, w: 120, h: 64 };
  expect(round(route(input({ elbow: false, b: side, exitAt: P(a, 160, 56) })).points)).toEqual([[160, 56], [400, 56]]);
  // 両方自由なら、斜めは中心どうし、横に並べば重なる範囲の真ん中
  expect(route(input({ elbow: false, b: side })).points).toEqual([[160, 72], [400, 72]]);
});

test("端の固定は、相手と反対の辺でも、箱が重なっても消さない（消すよう知らせない）", () => {
  const over = { x: 100, y: 60, w: 120, h: 64 };
  const r = route(input({ b: over, exitAt: P(a, 100, 40) }));
  expect([r.arrangement, round(r.points)[0], r.fix]).toEqual(["overlap", [100, 40], {}]);
  const far = route(input({ exitAt: P(a, 40, 72) })); // b は右下だが、左の辺に固定
  expect([round(far.points)[0], far.fix, orthogonal(far.points)]).toEqual([[40, 72], {}, true]);
});

test("折れ線: 固定の端は、その点から、その辺の向きに出入りする", () => {
  // 右の辺の上から 1/4 に固定: 右へ出て b の上へ入る L 字
  expect(round(route(input({ exitAt: P(a, 160, 56) })).points)).toEqual([[160, 56], [460, 56], [460, 300]]);
  // 上の辺の真ん中に固定: 上へ出て回り込む（下にいる b へも上から出る）
  const top = route(input({ exitAt: P(a, 100, 40) })).points;
  expect([round(top)[0], top[1]![1] < 40, orthogonal(top)]).toEqual([[100, 40], true, true]);
  // 終点を b の左の辺に固定し、始点は自由: 縦に出て横に入る L 字
  expect(round(route(input({ enterAt: P(b, 400, 332) })).points)).toEqual([[100, 104], [100, 332], [400, 332]]);
});

test("横に並ぶ箱どうしの折れ線: 片方の端を固定し、もう一方が自由なら、自由な端をそろえてまっすぐ。そろえられなければ真ん中で折る Z 字", () => {
  const side = { x: 400, y: 60, w: 120, h: 64 }; // a の右。重なる範囲は y = 60〜104、真ん中は 82
  expect(route(input({ b: side })).points).toEqual([[160, 82], [400, 82]]);
  expect(round(route(input({ b: side, exitAt: P(a, 160, 90) })).points)).toEqual([[160, 90], [400, 90]]);
  const z = route(input({ b: side, exitAt: P(a, 160, 44) })); // y = 44 は b の高さ（60〜124）に無い
  expect([round(z.points), z.segments.length]).toEqual([[[160, 44], [280, 44], [280, 92], [400, 92]], 1]);
});

test("長さ 0 の区間をまとめるときも、ずらした端の位置で測る", () => {
  // 出る位置が y = 56 なら、via [200, 56, 300] の 2 つ目の横の区間は出た区間と同じ高さ。最初の 2 つの折れ目をまとめる
  const s = { exit: "horizontal" as const, enter: "horizontal" as const, via: [200, 56, 300] };
  expect(simplifyVia(a, b, s, { exitAt: 0.25, enterAt: null })).toEqual([300]);
  expect(simplifyVia(a, b, s)).toEqual([200, 56, 300]);
});

test("自由な端は、前に描いた辺と位置（memory）を折れ目 3 つまで保つ。保てなければ一番よい形", () => {
  const first = route(input());
  expect(first.points).toEqual([[160, 72], [460, 72], [460, 300]]); // 右から出て b の上へ
  expect(first.memory).toEqual({ exit: { side: "r", at: 0.5 }, enter: { side: "t", at: 0.5 } });
  // b を a の真下へ動かす。一番よい形はまっすぐだが、前の辺（a の右、b の上）を折れ目 3 つで保てるので保つ
  const below = { x: 60, y: 300, w: 120, h: 64 };
  const kept = route(input({ b: below, memory: first.memory }));
  expect([kept.points[0], kept.points.at(-1), kept.bends]).toEqual([[160, 72], [120, 300], 3]);
  expect(route(input({ b: below })).points).toEqual([[110, 104], [110, 300]]);
  // b を a の左へ動かす。a の右から b の左へは折れ目 4 つ要るので保たず、一番よい形（まっすぐ）
  const left = { x: -300, y: 40, w: 120, h: 64 };
  const moved = route(input({ b: left, memory: { exit: { side: "r", at: 0.5 }, enter: { side: "l", at: 0.5 } } }));
  expect(moved.points).toEqual([[40, 72], [-180, 72]]);
  // 固定の端は記憶を持たない
  expect(route(input({ exitAt: P(a, 160, 56) })).memory?.exit).toBeNull();
});

test("ひし形（端を頂点に限る箱）: 自由な端は頂点から。固定の位置は一番近い頂点として読む", () => {
  // 直線: 中心どうしの線が縁と交わる点に一番近い頂点（下）。相手の端はその頂点へ向ける
  const s = route(input({ elbow: false, aVertex: true }));
  expect(s.points[0]).toEqual([100, 104]);
  expect(route(input({ elbow: false, aVertex: true, exitAt: P(a, 160, 60) })).points[0]).toEqual([160, 72]);
  // 折れ線: 真下の普通の箱は、頂点にそろえてまっすぐ
  const below = { x: 60, y: 300, w: 120, h: 64 };
  expect(route(input({ b: below, aVertex: true })).points).toEqual([[100, 104], [100, 300]]);
  // そろえられなければ（頂点の x が相手の幅に無い）、相手の辺の真ん中から折れて結ぶ。斜めにしない
  const off = { x: 120, y: 300, w: 120, h: 64 };
  const z = route(input({ b: off, aVertex: true }));
  expect([z.points[0], z.points.at(-1), orthogonal(z.points)]).toEqual([[100, 104], [180, 300], true]);
});

test("整列: 向き合う辺どうしでまっすぐ結べるなら、重なる範囲の真ん中でまっすぐ。そうでなければ辺の真ん中", () => {
  const side = { x: 400, y: 60, w: 120, h: 64 };
  const before = route(input({ b: side, exitAt: P(a, 160, 44) }));
  const at = alignedEnds(input({ b: side }), before.points);
  expect(round(route(input({ b: side, ...at })).points)).toEqual([[160, 82], [400, 82]]);
  const l = route(input()).points; // 右から出て b の上へ入る L 字
  const at2 = alignedEnds(input(), l);
  expect(round(route(input(at2)).points)).toEqual([[160, 72], [460, 72], [460, 300]]);
  expect(at2.exitAt).toBeCloseTo(P(a, 160, 72), 4);
  expect(at2.enterAt).toBeCloseTo(P(b, 460, 300), 4);
});

// ---- ほかの箱を避ける（段階 5） ----

test("自動の L 字がほかの箱を通るなら、通らないもう一方の L 字にする", () => {
  const o1 = { x: 420, y: 150, w: 80, h: 60 }; // 自動の L 字（右へ出て b の上へ入る）の縦の区間をふさぐ
  const r = route(input({ obstacles: [o1] }));
  expect([r.points, r.shape]).toEqual([[[100, 104], [100, 332], [400, 332]], { exit: "vertical", enter: "horizontal", via: [] }]);
});

test("L 字がどちらも通れなければ、折れ目の多い Z 字から探す", () => {
  const o1 = { x: 420, y: 150, w: 80, h: 60 }, o2 = { x: 60, y: 200, w: 80, h: 60 };
  const r = route(input({ obstacles: [o1, o2] }));
  expect(r.shape?.via.length).toBe(1);
  expect(r.points.length).toBe(4);
  expect([o1, o2].some(o => passes(r.points, o))).toBe(false);
});

test("固定の端は守って避ける", () => {
  const o1 = { x: 420, y: 150, w: 80, h: 60 };
  const r = route(input({ exitAt: P(a, 160, 72), obstacles: [o1] }));
  expect(r.points[0]).toEqual([160, 72]); // 右の辺の真ん中から出る
  expect(passes(r.points, o1)).toBe(false);
});

test("横に並ぶ箱どうしのまっすぐな線がほかの箱を通るなら、外を回る", () => {
  const side = { x: 400, y: 40, w: 120, h: 64 };
  const o = { x: 240, y: 50, w: 60, h: 40 };
  const r = route(input({ b: side, obstacles: [o] }));
  expect(r.shape?.via.length).toBe(1);
  expect(passes(r.points, o)).toBe(false);
});

test("手で直した形（via）は、ほかの箱を通っても避けない", () => {
  const o = { x: 260, y: 150, w: 40, h: 40 };
  const r = route(input({ ...fixedZ, via: [280], obstacles: [o] }));
  expect(round(r.points)).toEqual([[160, 72], [280, 72], [280, 332], [400, 332]]);
});

test("候補の一覧: 折れ目の数・長さ・ほかの箱との距離を持つ（配置の戦略が選び直せるように）", () => {
  const o1 = { x: 420, y: 150, w: 80, h: 60 };
  const list = routeCandidates(input({ obstacles: [o1] }));
  expect(list.length).toBeGreaterThan(1);
  expect(list.every(c => !passes(c.points, o1))).toBe(true);
  const l = list.find(c => c.bends === 1)!;
  expect(l.length).toBe(528); // 228 + 300
  expect(l.clearance).toBeCloseTo(Math.hypot(20, 122), 5); // 横の区間の右端 (400, 332) から o1 の左下の角 (420, 210) まで
});

test("同じ折れ目の数・長さなら、ほかの箱から離れた方を選ぶ", () => {
  // C（a の右）が自動の L 字を、D（a の下）がもう一方の L 字をふさぐ。Z 字の中棒は a と b の間ならどこでも同じ長さ
  const b2 = { x: 400, y: 260, w: 120, h: 64 };
  const c = { x: 400, y: 40, w: 120, h: 64 }, d = { x: 40, y: 200, w: 120, h: 64 };
  const r = route(input({ b: b2, obstacles: [c, d] }));
  expect(r.points).toEqual([[160, 72], [280, 72], [280, 292], [400, 292]]); // 真ん中（C と D から 120 ずつ）
});

test("描いた線がほかの箱を通るかを返す（避ける道が見つからない、手で直した形、直線）", () => {
  const o = { x: 260, y: 150, w: 40, h: 40 };
  expect(route(input({ obstacles: [o] })).through).toBe(false); // 自動の L 字は通らない
  expect(route(input({ ...fixedZ, via: [280], obstacles: [o] })).through).toBe(true);
  // b を四方から囲む箱があると入れない
  const ring = [{ x: 380, y: 280, w: 160, h: 10 }, { x: 380, y: 374, w: 160, h: 10 }, { x: 380, y: 290, w: 10, h: 84 }, { x: 530, y: 290, w: 10, h: 84 }];
  expect(route(input({ obstacles: ring })).through).toBe(true);
});

test("道筋に関わらない遠くの箱は絞り込みで外れ、外しても結果は変わらない", () => {
  const o1 = { x: 420, y: 150, w: 80, h: 60 }, o2 = { x: 60, y: 200, w: 80, h: 60 };
  const far = { x: 1200, y: 900, w: 80, h: 60 };
  const full = input({ obstacles: [o1, o2, far] });
  expect(scopeObstacles(full)).toEqual([o1, o2]);
  expect(route({ ...full, obstacles: scopeObstacles(full) }).points).toEqual(route(full).points);
});

test("passes: 斜めの区間は、囲む矩形ではなく線そのものが矩形を通るかで見る", () => {
  // y = x の斜めの線。矩形は線の左上にあり、線を囲む矩形とは重なるが、線そのものは通らない
  expect(passes([[0, 0], [100, 100]], { x: 60, y: 0, w: 30, h: 30 })).toBe(false);
  expect(passes([[0, 0], [100, 100]], { x: 40, y: 40, w: 20, h: 20 })).toBe(true);
  // 縦と横の区間は今までどおり
  expect(passes([[0, 50], [100, 50]], { x: 40, y: 40, w: 20, h: 20 })).toBe(true);
  expect(passes([[0, 40], [100, 40]], { x: 40, y: 40, w: 20, h: 20 })).toBe(false); // 縁に触れるだけ
});

