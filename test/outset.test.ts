// 配置の土台と見た目の補正値（docs/LAYOUT-BASE-plan.md）: テーマは補正値（定数）でだけ配置に入り、テーマを変えても中心は動かない
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
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
const center = (g: Graph, id: number) => [info(g, id).x + info(g, id).w / 2, info(g, id).y + info(g, id).h / 2];

test("テーマを付箋紙にすると、ノーマルの形は補正値の分だけ四方に広がり、中心は動かない。特殊な形と S は広がらない", () => {
  const g = setup({
    nodes: [
      { id: 1, caption: "箱", x: 100, y: 100 }, { id: 2, caption: "分岐", shape: "diamond", x: 400, y: 100 },
      { id: 3, caption: "小", size: "S", x: 100, y: 300 }, { id: 4, caption: "端", shape: "stadium", x: 400, y: 300 },
    ],
  });
  const before = [1, 2, 3, 4].map(id => ({ c: center(g, id), w: info(g, id).w, h: info(g, id).h }));
  g.update(null, { theme: "sticky" });
  const after = [1, 2, 3, 4].map(id => ({ c: center(g, id), w: info(g, id).w, h: info(g, id).h }));
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
  expect([gap(1, 2), gap(3, 4), gap(5, 6), gap(11, 12)]).toEqual([8, 32, 40, 8]);
});

test("ツリーの横の間隔も全世界の最小間隔に合わせてあるので、線で描き直しても箱は押しのけられず見た目の位置のまま", () => {
  const g = setup({
    nodes: [
      { id: 1, caption: "親", childView: "tree", x: 40, y: 40 },
      { id: 2, caption: "子A", parent: 1 }, { id: 3, caption: "子B", parent: 1 }, { id: 4, caption: "子C", parent: 1 },
    ],
  });
  const before = [2, 3, 4].map(id => info(g, 1).x + info(g, id).x); // 子の左端（ワールドの座標。子の位置は親の中）
  g.flattenTree(1);
  const after = [2, 3, 4].map(id => info(g, id).x);
  expect(after.map((x, i) => Math.abs(x - before[i]!) <= 1)).toEqual([true, true, true]);
});

test("近い箱どうしを線でつなぐと 32px まで離れ、その線にキャプションを付けると 40px まで離れる（始点の箱は動かない）", () => {
  const g = setup({ nodes: [{ id: 1, caption: "上", x: 100, y: 100 }, { id: 2, caption: "下", x: 100, y: 172 }] });
  const gap = () => info(g, 2).y - (info(g, 1).y + info(g, 1).h);
  expect(gap()).toBe(8);
  const top = info(g, 1).y;
  expect(g.link(1, 2)).toBe(true);
  expect(gap()).toBe(32);
  const id = String((g.toJSON().edges!.at(-1) as { id: string }).id);
  g.updateEdge(id, { caption: "はい" });
  expect(gap()).toBe(40);
  expect(info(g, 1).y).toBe(top);
});

test("フローチャートの中は、組ごとの最小間隔を使わない（戦略が明示的に無視する）。つながっていても 8px まで寄せられる", () => {
  const g = setup({
    nodes: [
      { id: 1, childView: "flow", x: 0, y: 0 },
      { id: 2, parent: 1, caption: "上", x: 20, y: 40 }, { id: 3, parent: 1, caption: "下", x: 20, y: 60 },
    ],
    edges: [{ id: "e1", from: 2, to: 3, caption: "はい" }],
  });
  expect(info(g, 3).y - (info(g, 2).y + info(g, 2).h)).toBe(8);
});
