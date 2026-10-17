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

test("はみ出しの境目: 右端・下端がちょうど表示領域の端なら収まり、越えれば右と下の両方を挙げる", () => {
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [box("1", 700, 550)], edges: [] }).split("\n")[0])
    .toBe("viewport 800x600, content 800x600 → fits");
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [box("1", 701, 551)], edges: [] }).split("\n")[0])
    .toBe("viewport 800x600, content 801x601 → over right 1, bottom 1");
});

test("子の箱は content の広さにも top の行にも数えない（最上位だけ）", () => {
  const p = box("1", 0, 0, 300, 200), kid = box("2", 250, 150, 900, 900, ["1"]);
  const lines = summarize({ viewport: { w: 800, h: 600 }, boxes: [p, kid], edges: [] }).split("\n");
  expect(lines).toEqual(["viewport 800x600, content 300x200 → fits", "top 1: #1 1 (0,0 300x200)"]);
});

test("キャプションは 12 文字までそのまま、13 文字から切って … を付ける", () => {
  const top = (caption: string) => summarize({ viewport: { w: 800, h: 600 }, boxes: [box("1", 0, 0, 100, 50, [], caption)], edges: [] }).split("\n")[1];
  expect(top("あいうえおかきくけこさし")).toBe("top 1: #1 あいうえおかきくけこさし (0,0 100x50)");
  expect(top("あいうえおかきくけこさしす")).toBe("top 1: #1 あいうえおかきくけこさし… (0,0 100x50)");
});

test("同じ箱につながる線どうしは、交わって見えても交差に数えない", () => {
  const a = box("1", 0, 0), b = box("2", 400, 200), c = box("3", 400, 0);
  // e1: 1 → 2、e2: 3 → 1 は 1 を共有する。わざと交わる道筋にする
  const e1: GeoEdge = { id: "e1", a: "1", b: "2", points: [[50, 25], [450, 225]] };
  const e2: GeoEdge = { id: "e2", a: "3", b: "1", points: [[450, 25], [50, 225]] };
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [a, b, c], edges: [e1, e2] })).not.toContain("cross");
});

test("線のキャプションの札が重なる箱を挙げる（一番外側だけ。線の両端の祖先は除く）", () => {
  const p = box("1", 0, 0, 600, 300), a = box("2", 10, 40, 100, 50, ["1"]), b = box("3", 400, 40, 100, 50, ["1"]);
  const g = box("4", 200, 30, 100, 100, ["1"]), inner = box("5", 210, 40, 40, 40, ["4", "1"]);
  const e: GeoEdge = { ...edge("e1", a, b), caption: "はい", label: { x: 220, y: 55, w: 30, h: 20 } };
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [p, a, b, g, inner], edges: [e] })).toContain("label 1: e1(2-3) はい>#4 4");
  // 札がどの箱にもかからなければ出さない
  const free: GeoEdge = { ...e, label: { x: 150, y: 140, w: 30, h: 20 } };
  expect(summarize({ viewport: { w: 800, h: 600 }, boxes: [p, a, b, g, inner], edges: [free] })).not.toContain("label");
});

test("紙のページは、表示領域ではなく紙の大きさに対してはみ出しを数える（見出しも paper）", () => {
  const g = { viewport: { w: 2000, h: 2000 }, paper: { name: "a5-landscape", w: 794, h: 559 }, boxes: [box("1", 700, 0)], edges: [] };
  expect(summarize(g).split("\n")).toEqual([
    "paper a5-landscape 794x559, content 800x50 → over right 6",
    "top 1: !#1 1 (700,0 100x50)",
  ]);
});

test("紙のはみ出しは、ふちの余白（inset）を除いた内側で数え、! は set を断る決まり（outside）と同じ箱に付く", () => {
  // 紙のふちから余白の内側には収まらない箱（右端が 794 − 12 を 4 越える）は、紙の中でもはみ出し。余白ちょうどまでなら fits
  const inset = 12;
  const out = { viewport: { w: 2000, h: 2000 }, paper: { name: "a5-landscape", w: 794, h: 559 }, inset, outside: ["1"], boxes: [box("1", 794 - inset - 96, 0)], edges: [] };
  expect(summarize(out).split("\n")).toEqual([
    "paper a5-landscape 794x559, content 786x50 → over right 4",
    "top 1: !#1 1 (686,0 100x50)",
  ]);
  const fits = { ...out, outside: [], boxes: [box("1", 794 - inset - 100, 0)] };
  expect(summarize(fits).split("\n")[0]).toBe("paper a5-landscape 794x559, content 782x50 → fits");
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
