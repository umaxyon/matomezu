// routing.ts のテスト。線の道筋を、画面を作らずに確かめる（docs/ROUTE-plan.md）
import { expect, test } from "bun:test";
import { type RouteInput, borderPath, passes, routeCandidates, scopeObstacles, sidePath, route, segmentsOf, shapePoints, simplifyVia } from "../web/src/routing";
import { nearestAt, pointAt } from "../web/src/geom";

// a: 40〜160 × 40〜104（中心 100, 72）、b: 400〜520 × 300〜364（中心 460, 332）
const a = { x: 40, y: 40, w: 120, h: 64 }, b = { x: 400, y: 300, w: 120, h: 64 };
const input = (o: Partial<RouteInput> = {}): RouteInput =>
  ({ a, b, elbow: true, exit: null, enter: null, via: null, bend: null, obstacles: [], margin: 12, ...o });

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

test("route: 手で直した via は使い、引けなければ via と向きの指定を消すよう知らせる", () => {
  const ok = route(input({ exit: "horizontal", enter: "horizontal", via: [300] }));
  expect([ok.points[1], ok.fix]).toEqual([[300, 72], {}]);
  const bad = route(input({ exit: "horizontal", enter: "horizontal", via: [100] }));
  expect(bad.fix).toEqual({ clearVia: true, clearDirections: true });
  expect(bad.shape).toEqual({ exit: "horizontal", enter: "vertical", via: [] }); // 自動の形（L 字）
});

test("route: 以前の bend は Z 字なら via に移すよう知らせ、Z 字でなければ消す", () => {
  const z = route(input({ exit: "horizontal", enter: "horizontal", bend: 0.25 }));
  expect(z.fix).toEqual({ migrate: { exit: "horizontal", enter: "horizontal", via: [220] } });
  expect(route(input({ bend: 0.25 })).fix).toEqual({ clearBend: true }); // 自動なら L 字
});

test("route: 直線には via を使わず、消すよう知らせる", () => {
  const r = route(input({ elbow: false, via: [280] }));
  expect(r.points.length).toBe(2);
  expect(r.fix).toEqual({ clearVia: true });
});

// ---- 斜めの直線の端の位置（段階 9） ----

test("相手に向いた側の辺をたどる道と、割合の点。0 と 1 は両方の箱で同じ側の角", () => {
  // b は a の右下。a の道は右上の角 → 右下の角 → 左下の角、b の道は右上 → 左上 → 左下
  expect(borderPath(a, b)).toEqual([[160, 40], [160, 104], [40, 104]]);
  expect(borderPath(b, a)).toEqual([[520, 300], [400, 300], [400, 364]]);
  // 長さは 64 + 120 = 184。0.5 は 92 進んだ所（右下の角から 28 左）
  expect(pointAt(borderPath(a, b), 0.5)).toEqual([132, 104]);
  expect(nearestAt(borderPath(a, b), 132, 130)).toBeCloseTo(0.5, 5);
});

test("route: 斜めの直線は、端の位置があればそこから引く。両端 0 なら右上の角どうし、両端 1 なら左下の角どうし", () => {
  const top = route(input({ elbow: false, exitAt: 0, enterAt: 0 }));
  expect([top.points, top.ends?.frame]).toEqual([[[160, 40], [520, 300]], "se"]);
  expect(route(input({ elbow: false, exitAt: 1, enterAt: 1 })).points).toEqual([[40, 104], [400, 364]]);
});

test("route: 端の位置の基準が前と変わる（相手の向き、直線と折れ線の切り替え）、箱が重なるときは、端の位置を消すよう知らせる", () => {
  expect(route(input({ elbow: false, exitAt: 0.3, prevFrame: "nw" })).fix).toEqual({ clearAt: true });
  expect(route(input({ elbow: false, exitAt: 0.3, prevFrame: "se" })).fix).toEqual({});
  expect(route(input({ elbow: true, exitAt: 0.3, prevFrame: "se" })).fix).toEqual({ clearAt: true }); // 直線から折れ線へ
  const side = { x: 400, y: 60, w: 120, h: 64 }; // a と横に並ぶ（右）
  expect(route(input({ b: side, elbow: false, enterAt: 0.3, prevFrame: "se" })).fix).toEqual({ clearAt: true });
  const over = { x: 100, y: 60, w: 120, h: 64 }; // a と重なる
  expect(route(input({ b: over, elbow: false, exitAt: 0.3 })).fix).toEqual({ clearAt: true });
});

test("route: 横か縦に並ぶ直線も、端の位置があれば向き合う辺の上のそこから引く", () => {
  // a: 40〜160 × 40〜104。横に並ぶ相手（右）なら a の右の辺を上から下、相手の左の辺を上から下
  const side = { x: 400, y: 60, w: 120, h: 64 };
  const r = route(input({ b: side, elbow: false, exitAt: 0, enterAt: 1, prevFrame: "e" }));
  expect([r.points, r.ends?.frame, r.fix]).toEqual([[[160, 40], [400, 124]], "e", {}]);
  expect(route(input({ b: side, elbow: false })).points).toEqual([[160, 82], [400, 82]]); // 自動はまっすぐ
  // 縦に並ぶ相手（下）なら a の下の辺を左から右
  const below = { x: 100, y: 300, w: 120, h: 64 };
  const s = route(input({ b: below, elbow: false, exitAt: 0.5 }));
  expect([s.points[0], s.ends?.frame]).toEqual([[100, 104], "s"]);
});

// ---- 折れ線の端の位置（段階 4） ----

test("折れ線の端は、出入りする辺の上の割合の位置から。左右の辺は上から、上下の辺は左から", () => {
  expect(sidePath(a, "r")).toEqual([[160, 40], [160, 104]]);
  expect(sidePath(b, "t")).toEqual([[400, 300], [520, 300]]);
  // 自動は L 字（右から出て上に入る）。出る位置は右の辺の上から 1/4、入る位置は上の辺の左から 1/4
  const auto = route(input());
  expect([auto.points, auto.ends?.frame]).toEqual([[[160, 72], [460, 72], [460, 300]], "elbow:rt"]);
  const moved = route(input({ exitAt: 0.25, enterAt: 0.25, prevFrame: "elbow:rt" }));
  expect([moved.points, moved.fix]).toEqual([[[160, 56], [430, 56], [430, 300]], {}]);
  // Z 字の中棒も、ずらした位置どうしをつなぐ
  expect(route(input({ exit: "horizontal", enter: "horizontal", via: [280], exitAt: 0 })).points)
    .toEqual([[160, 40], [280, 40], [280, 332], [400, 332]]);
});

test("折れ線の端の位置は、出る辺・入る辺が前と変わったら消すよう知らせる", () => {
  const r = route(input({ exitAt: 0.25, prevFrame: "elbow:bl" }));
  expect([r.points, r.fix]).toEqual([[[160, 72], [460, 72], [460, 300]], { clearAt: true }]);
});

test("横に並ぶ箱どうしの折れ線は、端をずらすと真ん中で折る Z 字になる", () => {
  const side = { x: 400, y: 60, w: 120, h: 64 }; // a の右。重なる範囲の真ん中は y = 82
  const auto = route(input({ b: side }));
  expect([auto.points, auto.ends?.frame, auto.segments]).toEqual([[[160, 82], [400, 82]], "elbow:rl", []]);
  const z = route(input({ b: side, exitAt: 0, prevFrame: "elbow:rl" }));
  expect([z.points, z.fix, z.segments.length]).toEqual([[[160, 40], [280, 40], [280, 92], [400, 92]], {}, 1]);
});

test("長さ 0 の区間をまとめるときも、ずらした端の位置で測る", () => {
  // 出る位置が y = 56 なら、via [200, 56, 300] の 2 つ目の横の区間は出た区間と同じ高さ。最初の 2 つの折れ目をまとめる
  const s = { exit: "horizontal" as const, enter: "horizontal" as const, via: [200, 56, 300] };
  expect(simplifyVia(a, b, s, { exitAt: 0.25, enterAt: null })).toEqual([300]);
  expect(simplifyVia(a, b, s)).toEqual([200, 56, 300]);
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

test("向きの指定は守って避ける", () => {
  const o1 = { x: 420, y: 150, w: 80, h: 60 };
  const r = route(input({ exit: "horizontal", obstacles: [o1] }));
  expect(r.shape?.exit).toBe("horizontal");
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
  const r = route(input({ exit: "horizontal", enter: "horizontal", via: [280], obstacles: [o] }));
  expect(r.points).toEqual([[160, 72], [280, 72], [280, 332], [400, 332]]);
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
  expect(route(input({ exit: "horizontal", enter: "horizontal", via: [280], obstacles: [o] })).through).toBe(true);
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
