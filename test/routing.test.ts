// routing.ts のテスト。線の道筋を、画面を作らずに確かめる（docs/ROUTE-plan.md）
import { expect, test } from "bun:test";
import { type RouteInput, route, segmentsOf, shapePoints, simplifyVia } from "../web/src/routing";

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
