// 方針（policy.ts）の単体のテスト。図全体を作らずに、判断の単位ごとの決まりを確かめる
import { expect, test } from "bun:test";
import type { Box } from "../web/src/model";
import { SCENES, createAnchorRules } from "../web/src/layout/policy";

const box = (x: number, y: number, w = 100, h = 60) =>
  ({ x, y, w, h, hx: 0, hy: 0, hw: w, hh: h, parent: null }) as unknown as Box;
const grow = (n: Box, w: number, h: number) => Object.assign(n, { w, h, hw: w, hh: h });
const rules = createAnchorRules({ anchorRect: n => ({ x: n.hx, y: n.hy, w: n.hw, h: n.hh }) });

test("何を保つか topLeft: 広がっても縮んでも左上を保つ", () => {
  const n = box(100, 50);
  const keep = rules.topLeft(n);
  grow(n, 300, 200);
  expect([keep.x(n), keep.y(n)]).toEqual([100, 50]);
  grow(n, 40, 20);
  expect([keep.x(n), keep.y(n)]).toEqual([100, 50]);
});

test("何を保つか topCenter: 上辺と横の中心を保つ", () => {
  const n = box(100, 50); // 横の中心 150
  const keep = rules.topCenter(n);
  grow(n, 300, 200);
  expect([keep.x(n), keep.y(n)]).toEqual([0, 50]);
  grow(n, 40, 20);
  expect([keep.x(n), keep.y(n)]).toEqual([130, 50]);
});

test("場面の表: 開いたときだけはみ出しを調整し、設定変更と本文の幅の変更だけが位置を保って大きい相手に譲り、子のサイズをそろえるときだけ詰め直す。手を離したときは重なった相手が動く。開いたとき・読み直しでは置いた位置を正とする", () => {
  const rows = Object.entries(SCENES).map(([name, s]) =>
    [name, !!s.anchor, s.yieldTo, s.giveWayToLarger, s.repack, s.fitViewport, s.adoptPlaced]);
  expect(rows).toEqual([
    ["open", false, "later", false, null, true, true],
    ["reload", false, "later", false, null, false, true],
    ["settings", true, "others", true, null, false, false],
    ["fitChildren", false, "others", false, { w: "down", h: "right" }, false, false],
    ["resizeBody", true, "others", true, null, false, false],
    ["drop", false, "others", false, null, false, false],
    ["remove", false, "others", false, null, false, false],
  ]);
  // 本文の幅は右の縁のつまみで変えるので、最上位でも左上を保つ（設定変更の最上位は中心を保つ）
  expect(SCENES.resizeBody.anchor).toEqual({ inGroup: "topLeft", topLevel: "topLeft" });
  expect(SCENES.settings.anchor).toEqual({ inGroup: "topLeft", topLevel: "topCenter" });
});
