// geom.ts のテスト。線の道筋・自分に戻る線・要約・線のドラッグが共通に使う、点と矩形と折れ線の純粋な関数
import { expect, test } from "bun:test";
import {
  type Pt, leftNormalAt, nearestAt, pointAt, polylineLength, rectsOverlap, segmentThroughRect, segmentsCross, segmentsOf,
} from "../web/src/geom";

// L 字: 右へ 100、下へ 50（全長 150）
const L: Pt[] = [[0, 0], [100, 0], [100, 50]];

test("polylineLength: 区間の長さの和。点が 1 つなら 0", () => {
  expect(polylineLength(L)).toBe(150);
  expect(polylineLength([[0, 0], [3, 4]])).toBe(5);
  expect(polylineLength([[7, 7]])).toBe(0);
});

test("pointAt: 長さの割合の点。0 と 1 は両端、範囲の外は端に寄せる、折れ目をまたぐ", () => {
  expect(pointAt(L, 0)).toEqual([0, 0]);
  expect(pointAt(L, 1)).toEqual([100, 50]);
  expect(pointAt(L, -0.5)).toEqual([0, 0]);
  expect(pointAt(L, 1.5)).toEqual([100, 50]);
  expect(pointAt(L, 100 / 150)).toEqual([100, 0]); // ちょうど折れ目
  expect(pointAt(L, 125 / 150)).toEqual([100, 25]); // 2 つ目の区間の真ん中
});

test("pointAt: 長さ 0 の区間があっても、その先の区間で測る（0 で割らない）", () => {
  const dup: Pt[] = [[0, 0], [0, 0], [100, 0]];
  expect(pointAt(dup, 0.5)).toEqual([50, 0]);
  for (const v of pointAt(dup, 0)) expect(Number.isFinite(v)).toBe(true);
});

test("nearestAt と pointAt は行き来できる（線の上の点の割合を測って戻すと同じ点）", () => {
  for (const t of [0, 0.1, 0.33, 100 / 150, 0.9, 1]) {
    const [x, y] = pointAt(L, t);
    expect(nearestAt(L, x, y)).toBeCloseTo(t, 9);
  }
});

test("nearestAt: 線から離れた点は、一番近い線の上の点の割合。長さ 0 の線は 0", () => {
  expect(nearestAt(L, 50, -30)).toBeCloseTo(50 / 150, 9);  // 1 つ目の区間の真上
  expect(nearestAt(L, 130, 25)).toBeCloseTo(125 / 150, 9); // 2 つ目の区間の右
  expect(nearestAt(L, -100, -100)).toBe(0);                // 始点より手前
  expect(nearestAt(L, 100, 999)).toBe(1);                  // 終点より先
  expect(nearestAt([[5, 5], [5, 5]], 0, 0)).toBe(0);
});

test("leftNormalAt: 進む向きの左を指す長さ 1 の向き（画面の座標は y が下向き）", () => {
  const n = (pts: Pt[], at: number) => leftNormalAt(pts, at).map(v => v + 0); // -0 を 0 にそろえる
  expect(n([[0, 0], [10, 0]], 0.5)).toEqual([0, -1]);  // 右へ進むなら上
  expect(n([[0, 0], [0, 10]], 0.5)).toEqual([1, 0]);   // 下へ進むなら右
  expect(n([[10, 0], [0, 0]], 0.5)).toEqual([0, 1]);   // 左へ進むなら下
  // 折れ目をまたげば、その区間の向き
  expect(n(L, 0.2)).toEqual([0, -1]);
  expect(n(L, 0.9)).toEqual([1, 0]);
  const [nx, ny] = leftNormalAt([[0, 0], [30, 40]], 0.5);
  expect(Math.hypot(nx, ny)).toBeCloseTo(1, 9);
});

test("segmentsOf: 隣り合う 2 点の組。点が 1 つなら空", () => {
  expect(segmentsOf(L)).toEqual([[[0, 0], [100, 0]], [[100, 0], [100, 50]]]);
  expect(segmentsOf([[1, 1]])).toEqual([]);
});

test("segmentsCross: 交われば true。端点が触れるだけ・T 字に触れるだけ・平行・同じ直線の上は数えない。向きを入れ替えても同じ", () => {
  const h: [Pt, Pt] = [[0, 0], [100, 0]];
  expect(segmentsCross(h, [[50, -10], [50, 10]])).toBe(true);
  expect(segmentsCross([[50, 10], [50, -10]], [[100, 0], [0, 0]])).toBe(true);
  expect(segmentsCross(h, [[100, 0], [200, 50]])).toBe(false);  // 端点どうし
  expect(segmentsCross(h, [[50, 0], [50, 10]])).toBe(false);    // T 字
  expect(segmentsCross(h, [[0, 5], [100, 5]])).toBe(false);     // 平行
  expect(segmentsCross(h, [[50, 0], [150, 0]])).toBe(false);    // 同じ直線の上で重なる
  expect(segmentsCross(h, [[150, -10], [150, 10]])).toBe(false); // 延長の上
});

const R = { x: 40, y: 40, w: 20, h: 20 };

test("segmentThroughRect: 縁から 1 の内側を通れば true。縁をなぞる・縁から 1 以内をかすめるだけなら false", () => {
  expect(segmentThroughRect([[0, 50], [100, 50]], R)).toBe(true);
  expect(segmentThroughRect([[0, 40], [100, 40]], R)).toBe(false);   // 上の縁をなぞる
  expect(segmentThroughRect([[0, 41], [100, 41]], R)).toBe(false);   // 縁から 1（内側の境目）
  expect(segmentThroughRect([[0, 41.5], [100, 41.5]], R)).toBe(true);
  expect(segmentThroughRect([[45, 0], [45, 39]], R)).toBe(false);    // 手前で止まる
  expect(segmentThroughRect([[50, 50], [200, 50]], R)).toBe(true);   // 中から出る
  expect(segmentThroughRect([[50, 50], [50, 50]], R)).toBe(true);    // 中の点（長さ 0）
});

test("segmentThroughRect: 縁から 1 を引くと幅か高さが残らない小さな矩形は、どの線も通らない", () => {
  expect(segmentThroughRect([[0, 50], [100, 50]], { x: 40, y: 49, w: 2, h: 2 })).toBe(false);
  expect(segmentThroughRect([[0, 50], [100, 50]], { x: 40, y: 40, w: 0, h: 20 })).toBe(false);
});

test("rectsOverlap: 辺が接するだけなら重ならない。margin を足すと、その距離まで離れていないと重なる", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  expect(rectsOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  expect(rectsOverlap(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);       // 接する
  expect(rectsOverlap(a, { x: 14, y: 0, w: 10, h: 10 }, 4)).toBe(false);    // ちょうど margin 離れている
  expect(rectsOverlap(a, { x: 13.9, y: 0, w: 10, h: 10 }, 4)).toBe(true);
  // 対称
  const b = { x: 13.9, y: 3, w: 2, h: 2 };
  expect(rectsOverlap(b, a, 4)).toBe(rectsOverlap(a, b, 4));
});
