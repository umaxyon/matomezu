// report.ts のテスト。配置の要約に、はみ出し・線の交差・線が通るボックス・切れた文字が出ること
import { expect, test } from "bun:test";
import { type GeoBox, type GeoEdge, details, summarize } from "../web/src/report";

const box = (id: string, x: number, y: number, w = 100, h = 50, ancestors: string[] = [], caption = id): GeoBox =>
  ({ id, caption, ancestors, x, y, w, h, cut: false });
const edge = (id: string, a: GeoBox, b: GeoBox): GeoEdge =>
  ({ id, a: a.id, b: b.id, points: [[a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w / 2, b.y + b.h / 2]] });

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

test("折れ線は区間ごとに、交差と箱を通る線を調べる", () => {
  const a = box("1", 0, 0), b = box("2", 400, 300), mid = box("3", 260, 100, 40, 40);
  // 1 の右から出て x = 280 で縦に下り、2 の左へ入る。縦の区間が 3 を通る
  const elbow: GeoEdge = { id: "e1", a: "1", b: "2", points: [[100, 25], [280, 25], [280, 325], [400, 325]] };
  const c = box("4", 200, 400), d = box("5", 360, 0, 40, 40);
  const other: GeoEdge = { id: "e2", a: "4", b: "5", points: [[250, 400], [380, 40]] };
  const text = summarize({ viewport: { w: 800, h: 600 }, boxes: [a, b, mid, c, d], edges: [elbow, other] });
  expect(text).toContain("through 1: e1(1-2)>#3 3");
  expect(text).toContain("cross 1: e1(1-2)xe2(4-5)");
});

test("details: 子のある箱ごとに、子の位置（親の左上から）と大きさ。子がさらに子を持てば [見せ方 子の数]、非表示ならその旨", () => {
  const box = (id: string, x: number, y: number, w: number, h: number, ancestors: string[] = [], more: Partial<GeoBox> = {}): GeoBox =>
    ({ id, caption: `B${id}`, ancestors, x, y, w, h, cut: false, ...more });
  const boxes = [
    box("1", 100, 50, 300, 200, [], { view: "nest", kids: 2 }),
    box("2", 112, 80, 120, 64, ["1"]),
    box("3", 240, 80, 140, 150, ["1"], { view: "tree", kids: 2 }),
    box("4", 250, 120, 120, 44, ["3", "1"]),
    box("5", 250, 172, 120, 44, ["3", "1"]),
    box("6", 500, 50, 120, 64, [], { view: "hidden", kids: 3 }),
  ];
  expect(details({ viewport: { w: 800, h: 600 }, boxes, edges: [] })).toEqual({
    "1": "in #1 B1 (nest 2, 300x200): #2 B2 (12,30 120x64); #3 B3 (140,30 140x150) [tree 2]",
    "3": "in #3 B3 (tree 2, 140x150): #4 B4 (10,40 120x44); #5 B5 (10,92 120x44)",
    "6": "in #6 B6 (hidden 3, 120x64): children are hidden",
  });
});
