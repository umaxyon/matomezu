// report.ts のテスト。配置の要約に、はみ出し・線の交差・線が通るボックス・切れた文字が出ること
import { expect, test } from "bun:test";
import { type GeoBox, type GeoEdge, summarize } from "../web/src/report";

const box = (id: string, x: number, y: number, w = 100, h = 50, ancestors: string[] = [], caption = id): GeoBox =>
  ({ id, caption, ancestors, x, y, w, h, cut: false });
const edge = (id: string, a: GeoBox, b: GeoBox): GeoEdge =>
  ({ id, a: a.id, b: b.id, x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2 });

test("収まっていれば1行だけ", () => {
  const a = box("1", 0, 0), b = box("2", 200, 0);
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [a, b], edges: [edge("e1", a, b)] }))
    .toBe("viewport 800x600, content 300x50 → fits\ntop 2: #1 1 (0,0 100x50); #2 2 (200,0 100x50)");
});

test("最上位のボックスを並べ、はみ出したものに ! を付ける", () => {
  const a = box("1", 0, 0), b = box("2", 900, 0, 100, 50, [], "とても長いキャプションのボックス");
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [a, b], edges: [] }).split("\n")).toEqual([
    "viewport 800x600, content 1000x50 → over right 200",
    "top 2: #1 1 (0,0 100x50); !#2 とても長いキャプションの… (900,0 100x50)",
  ]);
});

test("交差する線と、線が通るボックス（一番外側だけ）を挙げる", () => {
  const a = box("1", 0, 0), b = box("2", 400, 200), c = box("3", 0, 200), d = box("4", 400, 0);
  const g = box("5", 180, 60, 100, 100), inner = box("6", 190, 70, 50, 30, ["5"]);
  const text = summarize({
    viewport: { w: 800, h: 600 }, boxes: [a, b, c, d, g, inner],
    edges: [edge("e1", a, b), edge("e2", c, d)],
  });
  expect(text).toContain("cross 1: e1(1-2)xe2(3-4)");
  expect(text).toContain("through 2: e1(1-2)>#5 5; e2(3-4)>#5 5");
});

test("線の両端の祖先は、線が通っていても挙げない", () => {
  const p = box("1", 0, 0, 500, 200), a = box("2", 10, 40, 100, 50, ["1"]), b = box("3", 300, 40, 100, 50, ["1"]);
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [p, a, b], edges: [edge("e1", a, b)] })).not.toContain("through");
});

test("切れたキャプションを挙げる", () => {
  const a = { ...box("1", 0, 0, 64, 44, [], "とても長い名前のボックスです"), cut: true };
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [a], edges: [] })).toContain("cut 1: #1 とても長い名前のボックスです");
});
