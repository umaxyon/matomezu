// viewport.ts のテスト。スクロールの位置 = 余白 + ワールドの座標 × 倍率（D32）
import { expect, test } from "bun:test";
import { anchorAt, fromScroll, keepAnchor, scrollWorldTo, toScroll, visibleWorld } from "../web/src/viewport";

const v = { zoom: 2, margin: 50, ox: 50, oy: 50 };

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
  keepAnchor(stage, { ...v, zoom: 4 }, a);
  expect([stage.scrollLeft, stage.scrollTop]).toEqual([50 + 350 * 4 - 500, 50 + 175 * 4 - 350]);
});

test("ずらす量は縦横別（紙が小さく真ん中に寄せたとき）", () => {
  const c = { zoom: 0.5, margin: 50, ox: 200, oy: 80 };
  expect([toScroll(c, 100, "x"), toScroll(c, 100, "y")]).toEqual([250, 130]);
  expect([fromScroll(c, 250, "x"), fromScroll(c, 130, "y")]).toEqual([100, 100]);
});

test("toScroll と fromScroll は、どの倍率・ずらす量でも行き来できる", () => {
  for (const zoom of [0.5, 0.75, 1, 1.25, 3]) for (const [ox, oy] of [[0, 0], [88, 40], [300, 12.5]]) {
    const c = { zoom, margin: 88, ox: ox!, oy: oy! };
    for (const w of [-100, 0, 37.5, 1000]) {
      expect(fromScroll(c, toScroll(c, w, "x"), "x")).toBeCloseTo(w, 9);
      expect(fromScroll(c, toScroll(c, w, "y"), "y")).toBeCloseTo(w, 9);
    }
  }
});

test("anchorAt: 画面の点を渡すと、表示領域の左上からの位置と、その下のワールドの点。倍率を変えて keepAnchor すれば、その点は同じ画面の位置に残る", () => {
  const stage = document.createElement("div");
  stage.getBoundingClientRect = () => ({ left: 30, top: 20 }) as DOMRect;
  stage.scrollLeft = 250;
  stage.scrollTop = 50;
  const a = anchorAt(stage, v, { x: 130, y: 120 });
  expect(a).toEqual({ px: 100, py: 100, wx: fromScroll(v, 350), wy: fromScroll(v, 150, "y") });
  const next = { ...v, zoom: 0.5 };
  keepAnchor(stage, next, a);
  expect(fromScroll(next, stage.scrollLeft + a.px)).toBeCloseTo(a.wx, 9);
  expect(fromScroll(next, stage.scrollTop + a.py, "y")).toBeCloseTo(a.wy, 9);
});
