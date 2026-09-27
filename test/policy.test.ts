// 方針（policy.ts）の単体のテスト。図全体を作らずに、判断の単位ごとの決まりを確かめる
import { describe, expect, test } from "bun:test";
import type { Box, Edge } from "../web/src/model";
import { SCENES, createAnchorRules } from "../web/src/policy";

// 本体だけのボックス（線は本体につながる）。大きさが変わったあとの形は grow で作る
const box = (x: number, y: number, w = 100, h = 60) =>
  ({ x, y, w, h, hx: 0, hy: 0, hw: w, hh: h, parent: null }) as unknown as Box;
const grow = (n: Box, w: number, h: number) => Object.assign(n, { w, h, hw: w, hh: h });

function rules(edges: [Box, Box][]) {
  const es = edges.map(([a, b]) => ({ a, b }) as Edge);
  return createAnchorRules({
    anchorRect: n => ({ x: n.hx, y: n.hy, w: n.hw, h: n.hh }),
    incident: n => es.filter(e => e.a === n || e.b === n),
  });
}
const after = (keep: { x(m: Box): number; y(m: Box): number }, n: Box) => [keep.x(n), keep.y(n)];

describe("何を保つか", () => {
  test("topLeft: 左上を保つ", () => {
    const n = box(100, 50);
    const keep = rules([]).topLeft(n);
    grow(n, 300, 200);
    expect(after(keep, n)).toEqual([100, 50]);
  });

  test("edgeOrCenter: 相手がいなければ本体の中心を保つ", () => {
    const n = box(100, 100); // 中心 (150, 130)
    const keep = rules([]).edgeOrCenter(n);
    grow(n, 300, 200);
    expect(after(keep, n)).toEqual([0, 30]);
  });

  test("edgeOrCenter: 相手が右にだけいれば右辺、下にだけいれば下辺を保つ", () => {
    const n = box(100, 100), right = box(400, 300);
    const keep = rules([[n, right]]).edgeOrCenter(n);
    grow(n, 300, 200);
    expect(after(keep, n)).toEqual([200 - 300, 160 - 200]); // 右辺 200、下辺 160 のまま
  });

  test("edgeOrCenter: 相手が真下（左右の範囲の内側）にいれば、横は中心を保つ", () => {
    const n = box(100, 100), below = box(120, 400);
    const keep = rules([[n, below]]).edgeOrCenter(n);
    grow(n, 300, 200);
    expect(after(keep, n)).toEqual([150 - 150, 160 - 200]); // 横は中心 150、縦は下辺 160
  });
});

test("場面の表: 開いたときだけはみ出しを調整し、設定変更だけが位置を保って大きい相手に譲る", () => {
  const rows = Object.entries(SCENES).map(([name, s]) => [name, !!s.anchor, s.yieldTo, s.giveWayToLarger, s.fitViewport]);
  expect(rows).toEqual([
    ["open", false, "later", false, true],
    ["reload", false, "later", false, false],
    ["settings", true, "others", true, false],
    ["fitChildren", false, "others", false, false],
  ]);
});
