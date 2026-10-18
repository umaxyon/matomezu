// 配置の土台（docs/LAYOUT-BASE-plan.md）: テーマは見た目だけで、配置に入らない（D44。2026-10-18 ユーザー: テーマは余白を持たない）。
// 大きさが変わったとき、箱はページの起点（STRATEGIES の growFrom。内包は左上、ツリー・フローチャートは横の真ん中と上）から広がる（docs/PAPER-plan.md の 4.6）
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, createGraph, type Graph } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
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

test("テーマは見た目だけで、大きさにも位置にも入らない: 形 × サイズの全組で、付箋紙にしても戻しても箱は動かず大きさも同じ（D44。2026-10-18 ユーザー: テーマは余白を持たない）", () => {
  const sizes = ["L", "M", "S"] as const;
  // 紙（A3 横）に収まるように 9 列に並べる（紙に収まらない図は開かない。docs/PAPER-plan.md の 4.6 の 7）
  const at = (k: number) => ({ x: 20 + (k % 9) * 170, y: 20 + Math.floor(k / 9) * 150 });
  const nodes = SHAPES.flatMap((shape, i) => sizes.map((size, j) => ({ id: i * 3 + j + 1, caption: "形", shape, size, ...at(i * 3 + j) })));
  const g = setup({ world: { paper: "a3-landscape" }, nodes });
  expect(g.misfits()).toEqual([]);
  const rects = () => nodes.map(n => [n.shape, n.size, ...topLeft(g, n.id), info(g, n.id).w, info(g, n.id).h]);
  const before = rects();
  g.update(null, { theme: "sticky" });
  expect(rects()).toEqual(before);
  g.update(null, { theme: null });
  expect(rects()).toEqual(before);
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

test("リストの子も、テーマを変えても幅も高さも変わらない（D44。テーマは余白を持たない）", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const long = "あ".repeat(30); // M の最大の幅で折り返す長さ
  const g = createGraph(el, {
    nodes: [
      { id: 1, caption: "一覧", childView: "list", x: 40, y: 40 },
      { id: 2, caption: long, parent: 1 }, { id: 3, caption: "短い", parent: 1 },
      { id: 4, caption: "幅の指定", childView: "list", width: 200, fixedWidth: true, x: 400, y: 40 },
      { id: 5, caption: long, parent: 4 },
    ],
  }, { measureText: paddedMeasure });
  graphs.push(g);
  const sizes = () => [2, 3, 5].map(id => [info(g, id).w, info(g, id).h]);
  const before = sizes();
  g.update(null, { theme: "sticky" });
  expect(sizes()).toEqual(before);
  g.update(null, { theme: null });
  expect(sizes()).toEqual(before);
});
