// viewport.ts のテスト。スクロールの位置 = 余白 + ワールドの座標 × 倍率（D32）
import { expect, test } from "bun:test";
import { anchorAt, fromScroll, keepAnchor, scrollWorldTo, toScroll, visibleWorld } from "../web/src/viewport";

const v = { zoom: 2, margin: 50 };

test("スクロールの位置とワールドの座標を行き来する", () => {
  expect(toScroll(v, 100)).toBe(250);
  expect(fromScroll(v, 250)).toBe(100);
  expect(fromScroll(v, 0)).toBe(-25); // 余白の左端は、ワールドの座標では負
});

test("見えている範囲はワールドの座標で、広さは倍率で割る（表示領域は 1000 × 700。test/setup.ts）", () => {
  const stage = document.createElement("div");
  stage.scrollLeft = 250;
  stage.scrollTop = 50;
  expect(visibleWorld(stage, v)).toEqual({ x: 100, y: 0, w: 500, h: 350 });
});

test("ワールドの点へスクロールし、倍率を変えても覚えた点を同じ画面の位置に保つ", () => {
  const stage = document.createElement("div");
  const calls: ScrollToOptions[] = [];
  stage.scrollTo = ((o: ScrollToOptions) => { calls.push(o); }) as typeof stage.scrollTo;
  scrollWorldTo(stage, v, 10, 20);
  expect(calls).toEqual([{ left: 50 + 10 * 2, top: 50 + 20 * 2 }]);
  // 真ん中（500, 350）の下の点を覚え、倍率 4 にしても真ん中に来る
  stage.scrollLeft = 250;
  stage.scrollTop = 50;
  const a = anchorAt(stage, v);
  expect(a).toEqual({ px: 500, py: 350, wx: 350, wy: 175 });
  keepAnchor(stage, { zoom: 4, margin: 50 }, a);
  expect([stage.scrollLeft, stage.scrollTop]).toEqual([50 + 350 * 4 - 500, 50 + 175 * 4 - 350]);
});
