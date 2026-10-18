// 配置の土台と見た目の補正値（docs/LAYOUT-BASE-plan.md）: テーマは補正値（定数）でだけ配置に入る。テーマを変えたとき、箱はページの起点
// （STRATEGIES の growFrom。内包は左上、ツリー・フローチャートは横の真ん中と上）から広がる（docs/PAPER-plan.md の 4.6）
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, createGraph, type Graph } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
import { SHAPE_DEFS } from "../web/src/shapes";
import { THEMES } from "../web/src/theme";
import { SHAPES } from "../web/src/validate";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});
const setup = (data: Diagram) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure });
  graphs.push(graph);
  return graph;
};
const info = (g: Graph, id: number) => g.info(id) as BoxInfo;
const topLeft = (g: Graph, id: number) => [info(g, id).x, info(g, id).y];

test("テーマを付箋紙にすると、ノーマルの形は補正値の分だけ広がり、内包のページでは左上を保つ。特殊な形と S は広がらない", () => {
  const g = setup({
    nodes: [
      { id: 1, caption: "箱", x: 100, y: 100 }, { id: 2, caption: "分岐", shape: "diamond", x: 400, y: 100 },
      { id: 3, caption: "小", size: "S", x: 100, y: 300 }, { id: 4, caption: "端", shape: "stadium", x: 400, y: 300 },
    ],
  });
  const before = [1, 2, 3, 4].map(id => ({ c: topLeft(g, id), w: info(g, id).w, h: info(g, id).h }));
  g.update(null, { theme: "sticky" });
  const after = [1, 2, 3, 4].map(id => ({ c: topLeft(g, id), w: info(g, id).w, h: info(g, id).h }));
  for (const i of [0, 1, 2, 3]) expect(after[i]!.c).toEqual(before[i]!.c);
  expect([after[0]!.w - before[0]!.w, after[0]!.h - before[0]!.h]).toEqual([8, 8]); // ボックス: 上下左右 +4
  expect([after[3]!.w - before[3]!.w, after[3]!.h - before[3]!.h]).toEqual([8, 8]); // 角丸もノーマル
  expect([after[1]!.w, after[1]!.h]).toEqual([before[1]!.w, before[1]!.h]);        // ひし形は特殊
  expect([after[2]!.w, after[2]!.h]).toEqual([before[2]!.w, before[2]!.h]);        // S の補正値は 0
  // 戻すと、元の位置と大きさに戻る
  g.update(null, { theme: null });
  expect(info(g, 1).x).toBe(100);
  expect(info(g, 1).w).toBe(before[0]!.w);
});

test("形 × サイズの全組: 補正値はノーマルの形にだけ、サイズごとの値（上下, 左右）で効き、内包のページでは左上を保つ", () => {
  const sticky = THEMES.find(t => t.id === "sticky")!;
  const was = sticky.outset;
  // 上下と左右・サイズごとに違う値にする（取り違えれば失敗する）
  sticky.outset = { L: [2, 6], M: [3, 5], S: [1, 7] };
  try {
    const sizes = ["L", "M", "S"] as const;
    // 紙（A3 横）に収まるように 9 列に並べる（紙に収まらない図は開かない。docs/PAPER-plan.md の 4.6 の 7）
    const at = (k: number) => ({ x: 20 + (k % 9) * 170, y: 20 + Math.floor(k / 9) * 150 });
    const nodes = SHAPES.flatMap((shape, i) => sizes.map((size, j) => ({ id: i * 3 + j + 1, caption: "形", shape, size, ...at(i * 3 + j) })));
    const g = setup({ world: { paper: "a3-landscape" }, nodes });
    expect(g.misfits()).toEqual([]);
    const before = nodes.map(n => ({ c: topLeft(g, n.id), w: info(g, n.id).w, h: info(g, n.id).h }));
    g.update(null, { theme: "sticky" });
    nodes.forEach((n, k) => {
      const normal = SHAPE_DEFS[n.shape].kind === "normal";
      const [v, hz] = normal ? sticky.outset![n.size]! : [0, 0];
      const now = { c: topLeft(g, n.id), w: info(g, n.id).w, h: info(g, n.id).h };
      expect([n.shape, n.size, now.w - before[k]!.w, now.h - before[k]!.h]).toEqual([n.shape, n.size, 2 * hz, 2 * v]);
      expect([n.shape, n.size, now.c]).toEqual([n.shape, n.size, before[k]!.c]);
    });
  } finally {
    sticky.outset = was;
  }
});

test("箱どうしの最小間隔は組ごと: つながっていなければ 8px、線でつながれば 32px、その線にキャプションがあれば 40px。リストの子は 8px", () => {
  // 3 組とも、下の箱を上の箱に重ねて置く（押しのけられた間隔を見る）
  const g = setup({
    nodes: [
      { id: 1, caption: "上", x: 100, y: 100 }, { id: 2, caption: "下", x: 100, y: 120 },
      { id: 3, caption: "上", x: 400, y: 100 }, { id: 4, caption: "下", x: 400, y: 120 },
      { id: 5, caption: "上", x: 700, y: 100 }, { id: 6, caption: "下", x: 700, y: 120 },
      { id: 10, caption: "リスト", childView: "list", x: 1000, y: 100 }, { id: 11, caption: "a", parent: 10 }, { id: 12, caption: "b", parent: 10 },
    ],
    edges: [{ id: "e1", from: 3, to: 4 }, { id: "e2", from: 5, to: 6, caption: "はい" }],
  });
  const gap = (up: number, down: number) => info(g, down).y - (info(g, up).y + info(g, up).h);
  expect([gap(1, 2), gap(3, 4), gap(5, 6), gap(11, 12)]).toEqual([DEFAULTS.gap, DEFAULTS.linkGap, DEFAULTS.captionGap, STRATEGIES.list.kidGap!]);
});

test("ツリーの横の間隔も全世界の最小間隔に合わせてあるので、線で描き直しても箱は押しのけられず見た目の位置のまま", () => {
  const g = setup({
    world: { childView: "tree", root: 1 },
    nodes: [
      { id: 1, caption: "親", x: 40, y: 40 },
      { id: 2, caption: "子A", parent: 1 }, { id: 3, caption: "子B", parent: 1 }, { id: 4, caption: "子C", parent: 1 },
    ],
  });
  const before = [2, 3, 4].map(id => info(g, 1).x + info(g, id).x); // 子の左端（ワールドの座標。子の位置は親の中）
  g.flattenTree();
  const after = [2, 3, 4].map(id => info(g, id).x);
  expect(after.map((x, i) => Math.abs(x - before[i]!) <= 1)).toEqual([true, true, true]);
});

test("近い箱どうしを線でつなぐと 32px まで離れ、その線にキャプションを付けると 40px まで離れる（始点の箱は動かない）", () => {
  const g = setup({ nodes: [{ id: 1, caption: "上", x: 100, y: 100 }, { id: 2, caption: "下", x: 100, y: 172 }] });
  const gap = () => info(g, 2).y - (info(g, 1).y + info(g, 1).h);
  expect(gap()).toBe(DEFAULTS.gap);
  const top = info(g, 1).y;
  expect(g.link(1, 2)).toBe(true);
  expect(gap()).toBe(DEFAULTS.linkGap);
  const id = String((g.toJSON().edges!.at(-1) as { id: string }).id);
  g.updateEdge(id, { caption: "はい" });
  expect(gap()).toBe(DEFAULTS.captionGap);
  expect(info(g, 1).y).toBe(top);
});

test("フローチャートの中は、組ごとの最小間隔を使わない（戦略が明示的に無視する）。つながっていても 8px まで寄せられる", () => {
  const g = setup({
    world: { childView: "flow" },
    nodes: [{ id: 2, caption: "上", x: 20, y: 40 }, { id: 3, caption: "下", x: 20, y: 60 }],
    edges: [{ id: "e1", from: 2, to: 3, caption: "はい" }],
  });
  expect(info(g, 3).y - (info(g, 2).y + info(g, 2).h)).toBe(DEFAULTS.gap);
});

test("位置の無い子を格子に置くとき、線でつながった兄弟とは 32px で隣に並ぶ（1 つ先の目まで飛ばない）", () => {
  const g = setup({
    nodes: [{ id: 1, caption: "グループ", x: 40, y: 40 }, { id: 2, caption: "A", parent: 1 }, { id: 3, caption: "B", parent: 1 }],
    edges: [{ id: "e1", from: 2, to: 3 }],
  });
  const [a, b] = [info(g, 2), info(g, 3)];
  expect(b.y).toBe(a.y);
  expect(b.x - (a.x + a.w)).toBe(DEFAULTS.linkGap);
});

// 本物のブラウザと同じく、箱の中の余白に補正値（render.ts が付ける --mz-out-x / --mz-out-y）を足して測る（fakeMeasure は足さない）
const outOf = (el: HTMLElement, axis: "x" | "y") => Number.parseFloat(el.style.getPropertyValue(`--mz-out-${axis}`)) || 0;
const paddedMeasure: typeof fakeMeasure = (el, width) => {
  const ox = 2 * outOf(el, "x"), oy = 2 * outOf(el, "y");
  const [w, h] = fakeMeasure(el, width == null ? null : width - ox);
  return [width == null ? w + ox : width, h + oy];
};

test("リストの子も補正値の分だけ幅が広がり、テーマを変えても文字を折り返す幅は変わらない（E1）", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const long = "あ".repeat(30); // M の最大の幅で折り返す長さ
  const g = createGraph(el, {
    nodes: [
      { id: 1, caption: "一覧", childView: "list", x: 40, y: 40 },
      { id: 2, caption: long, parent: 1 }, { id: 3, caption: "短い", parent: 1 },
      { id: 4, caption: "幅の指定", childView: "list", width: 200, x: 400, y: 40 },
      { id: 5, caption: long, parent: 4 },
    ],
  }, { measureText: paddedMeasure });
  graphs.push(g);
  const sizes = () => [2, 3, 5].map(id => [info(g, id).w, info(g, id).h]);
  const before = sizes();
  g.update(null, { theme: "sticky" });
  const [ox, oy] = [8, 8]; // 付箋紙の M の補正値（上下左右 4）
  expect(sizes()).toEqual(before.map(([w, h]) => [w! + ox, h! + oy]));
  g.update(null, { theme: null });
  expect(sizes()).toEqual(before);
});
