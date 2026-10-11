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
