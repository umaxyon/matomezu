// ツリーは子孫全体に効く（docs/PATTERN-plan.md の 3.6 章）。子孫の見せ方は無視して何段でもツリーに並べ、解除（内包に戻す）と行き来できる
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxInfo, Diagram } from "../web/src/types";
import { dragBy, fakeMeasure, rectOf } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure });
  graphs.push(graph);
  return { el, graph };
}

// 1 が根（ツリー）。2・3 が子、4・5 が 2 の子（孫）。2 は自分ではリスト、3 は非表示と書いてあるが、ツリーの中では無視する。
// 20 は外の箱で、根に線をつなぐ。孫は内包のときの位置をデータに持つ
const data = (extra: Record<string, unknown> = {}): Diagram => ({
  world: { width: 1600 },
  nodes: [
    { id: 1, caption: "社長", childView: "tree", x: 40, y: 40, ...extra },
    { id: 2, caption: "部長A", parent: 1, childView: "list" },
    { id: 3, caption: "部長B", parent: 1, childView: "hidden" },
    { id: 4, caption: "課長A1", parent: 2, x: 12, y: 30 },
    { id: 5, caption: "課長A2", parent: 2, x: 140, y: 30 },
    { id: 6, caption: "課長B1", parent: 3 },
    { id: 20, caption: "外", x: 900, y: 40 },
  ],
  edges: [{ id: "e1", from: 1, to: 20 }],
});
const info = (g: Graph, id: number) => g.info(id) as BoxInfo;
// ワールドでの本体（見出し）の矩形（style の位置を祖先まで足す。happy-dom は配置を計算しないため）
function headOf(el: HTMLElement, id: number) {
  const node = el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!;
  const h = rectOf(node.querySelector<HTMLElement>(":scope > .mz-head")!);
  let x = h.x, y = h.y;
  for (let m: HTMLElement | null = node; m?.classList.contains("mz-node"); m = m.parentElement) { const r = rectOf(m); x += r.x; y += r.y; }
  return { x, y, w: h.w, h: h.h, cx: x + h.w / 2 };
}
const shown = (el: HTMLElement, id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!.style.display !== "none";

test("何段も伸びる: 子孫の見せ方（リスト・非表示）は無視して、孫もツリーに並ぶ。親は子の見出しの真ん中", () => {
  const { el } = setup(data());
  const [root, a, b, a1, a2, b1] = [1, 2, 3, 4, 5, 6].map(id => headOf(el, id));
  expect(a!.y).toBeGreaterThan(root!.y + root!.h);
  expect(b!.y).toBe(a!.y);
  expect(a1!.y).toBeGreaterThan(a!.y + a!.h);
  expect(a2!.y).toBe(a1!.y);
  expect(b1!.y).toBe(a1!.y);
  expect(shown(el, 6)).toBe(true); // 非表示と書いてあっても隠さない
  expect(a!.cx).toBe((a1!.cx + a2!.cx) / 2);
  expect(root!.cx).toBe((a!.cx + b!.cx) / 2);
});

test("枠は根だけが描き、線はツリーの節がそれぞれ描く", () => {
  const { el } = setup(data());
  const svg = (id: number) => el.querySelector<SVGSVGElement>(`.mz-node[data-id="${id}"] > .mz-tree`)!;
  const frame = (id: number) => svg(id).querySelector<SVGRectElement>(".mz-tree-frame")!;
  expect(frame(1).style.display).toBe("");
  expect(frame(2).style.display).toBe("none");
  expect(svg(2).style.display).toBe("");
  expect(svg(2).querySelector("path")!.getAttribute("d")).not.toBe("");
});

test("向きは根の向きに従い、全部の段がその向きに並ぶ", () => {
  const { el, graph } = setup(data({ treeDirection: "right" }));
  const [root, a, a1] = [1, 2, 4].map(id => headOf(el, id));
  expect(a!.x).toBeGreaterThan(root!.x + root!.w);
  expect(a1!.x).toBeGreaterThan(a!.x + a!.w);
  expect(info(graph, 4).treeDirection).toBe("right");
});

test("中の箱は手で動かせず、つかむとツリー全体が動く。外の箱との線は根につながる", () => {
  const { el, graph } = setup(data());
  const before = info(graph, 1);
  const inner = [info(graph, 4).x, info(graph, 4).y];
  dragBy(el, graph, 4, 0, 200);
  expect(info(graph, 1).y).toBeGreaterThan(before.y);
  expect([info(graph, 4).x, info(graph, 4).y]).toEqual(inner);
  expect(info(graph, 1).links.map(l => l.id)).toEqual(["20"]);
});

test("中の箱に子を足すと、ツリーの決まりで並べ直す", () => {
  const { el, graph } = setup(data());
  graph.reparent(20, 6);
  const b1 = headOf(el, 6), added = headOf(el, 20);
  expect(added.y).toBeGreaterThan(b1.y + b1.h);
  expect(added.cx).toBe(b1.cx);
});

test("解除（内包に戻す）と再適用を行き来でき、戻せば子孫の見せ方と内包の位置に戻る", () => {
  const { el, graph } = setup(data());
  const tree = JSON.stringify([1, 2, 3, 4, 5, 6].map(id => headOf(el, id)));
  graph.update(1, { childView: "nest" });
  // 解除すると、子孫は自分の見せ方に従う（2 はリスト、3 は非表示）
  expect(info(graph, 2).children.length).toBe(2);
  expect(shown(el, 6)).toBe(false);
  const nest = JSON.stringify([1, 2, 3, 4].map(id => [info(graph, id).x, info(graph, id).y, info(graph, id).w, info(graph, id).h]));
  graph.update(1, { childView: "tree" });
  expect(JSON.stringify([1, 2, 3, 4, 5, 6].map(id => headOf(el, id)))).toBe(tree);
  graph.update(1, { childView: "nest" });
  expect(JSON.stringify([1, 2, 3, 4].map(id => [info(graph, id).x, info(graph, id).y, info(graph, id).w, info(graph, id).h]))).toBe(nest);
});

test("サイドバーの情報: ツリーの中の箱には印が付き、根の箱には付かない", () => {
  const { graph } = setup(data());
  expect([info(graph, 1).inTree, info(graph, 2).inTree, info(graph, 4).inTree, info(graph, 20).inTree]).toEqual([false, true, true, false]);
});

test("線で描き直す: ツリーを平らにして、見た目の位置のまま兄弟に並べ、親から子へ腹のそろった折れ線を引く", () => {
  const { el, graph } = setup(data());
  const before = new Map([1, 2, 3, 4, 5, 6].map(id => [id, headOf(el, id)]));
  expect(graph.flattenTree(1)).toBe(true);
  const json = graph.toJSON();
  const node = (id: number) => json.nodes.find(n => n.id === id)!;
  // 全員が根の親（最上位）の直下に、見た目の位置のまま並ぶ。ツリーで無視していた見せ方は消える
  for (const id of [1, 2, 3, 4, 5, 6]) {
    expect(node(id).parent).toBeUndefined();
    expect(node(id).childView).toBeUndefined();
    const h = headOf(el, id), b = before.get(id)!;
    expect([h.x, h.y, h.w, h.h]).toEqual([b.x, b.y, b.w, b.h]);
  }
  // 親から子へ 1 本ずつ。端は辺の真ん中に固定し、兄弟の線は腹（横の区間の高さ）がそろう。矢印は付けない
  const made = (json.edges ?? []).filter(e => !Array.isArray(e) && e.id !== "e1") as Exclude<NonNullable<Diagram["edges"]>[number], unknown[]>[];
  expect(made.map(e => `${e.from}-${e.to}`).sort()).toEqual(["1-2", "1-3", "2-4", "2-5", "3-6"]);
  const via = (from: number) => [...new Set(made.filter(e => e.from === from).map(e => JSON.stringify(e.via)))];
  expect(via(1)).toHaveLength(1);
  expect(via(2)).toHaveLength(1);
  expect(made.every(e => e.arrow == null && e.exitAt != null && e.enterAt != null)).toBe(true);
  // 線は描かれ、親の下の辺の真ん中から出る
  const line = el.querySelector(`.mz-edge[data-id="${made.find(e => e.from === 1 && e.to === 2)!.id}"] polyline`);
  expect(line).not.toBeNull();
  // 外からの線は根の箱につながったまま。Undo で元のツリーに戻る
  expect(info(graph, 1).links.map(l => l.id).sort()).toEqual(["2", "20", "3"]);
  graph.undo();
  expect(graph.toJSON().nodes.find(n => n.id === 2)!.parent).toBe(1);
  expect(info(graph, 1).childView).toBe("tree");
});

test("線で描き直す: 外から根への線は、元の枠の中（子孫の箱の間）を通らない道に固定する", () => {
  // 21 は枠の下にある外の箱。自動の道筋のままだと、子の箱の間（2 と 3 の間）を縦に通って根へ上がる
  const base = data();
  const { el, graph } = setup({
    ...base, nodes: [...base.nodes, { id: 21, caption: "下", x: 268, y: 600 }], edges: [{ id: "e2", from: 21, to: 1 }],
  });
  const f = info(graph, 1);
  const frame = { x: f.x, y: f.y, w: f.w, h: f.h };
  const root = headOf(el, 1);
  graph.flattenTree(1);
  const e = graph.toJSON().edges!.find(x => !Array.isArray(x) && x.id === "e2") as { exitAt?: number; enterAt?: number; via?: number[] };
  expect(e.enterAt).toBeDefined();
  expect(e.via).toBeDefined();
  // 折れ目は、根の本体の脇を除いて、どれも元の枠の外にある
  const pts = el.querySelector(`.mz-edge[data-id="e2"] polyline`)!.getAttribute("points")!.trim().split(/\s+/).map(p => p.split(",").map(Number) as [number, number]);
  const inFrame = ([x, y]: [number, number]) => x > frame.x && x < frame.x + frame.w && y > frame.y && y < frame.y + frame.h;
  const byRoot = ([x, y]: [number, number]) => (x >= root.x && x <= root.x + root.w) || (y >= root.y && y <= root.y + root.h);
  expect(pts.filter(p => inFrame(p) && !byRoot(p))).toEqual([]);
});

test("線で描き直せるのは、ツリーにした一番外の箱だけ", () => {
  const { graph } = setup(data());
  expect(graph.flattenTree(2)).toBe(false); // ツリーの中の箱
  expect(graph.flattenTree(20)).toBe(false); // ツリーでない箱
});
