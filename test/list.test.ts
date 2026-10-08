// 子の見せ方「リスト」（docs/LIST-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure, violations } from "./helpers";

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

const LONG = "とても長い説明の項目です。折り返しを確かめます"; // 24 文字 → 1 行の幅 9 * 24 + 16 = 232
// 1 はリスト。2 は S の人、3 は長い文字、4 は子（5）をツリーで見せる箱。内包のときの位置をデータに持つ
const data = (extra: Partial<Diagram["nodes"][number]> = {}): Diagram => ({
  world: { width: 1000 },
  nodes: [
    { id: 1, caption: "一覧", x: 40, y: 40, childView: "list", ...extra },
    { id: 2, caption: "短い", parent: 1, size: "S", shape: "person", x: 300, y: 30 },
    { id: 3, caption: LONG, parent: 1, x: 12, y: 30 },
    { id: 4, caption: "孫あり", parent: 1, childView: "tree", x: 12, y: 200 },
    { id: 5, caption: "孫", parent: 4 },
    { id: 6, caption: "隣", x: 400, y: 40 },
  ],
  edges: [[2, 3], [1, 6]],
});
const box = (g: Graph, id: number) => g.info(id) as BoxInfo;
const rect = (g: Graph, id: number) => { const i = g.info(id); return [i.x, i.y, i.w, i.h]; };
const order = (g: Graph) => g.toJSON().nodes.map(n => n.id);

test("子を縦に並べ、一番広い子の幅にそろえる。親は中身に合わせる", () => {
  const { el, graph } = setup(data());
  expect([rect(graph, 2), rect(graph, 3), rect(graph, 4)]).toEqual([
    [12, 30, 232, 64], [12, 102, 232, 64], [12, 174, 232, 64],
  ]);
  expect(rect(graph, 1)).toEqual([40, 40, 232 + 24, 174 + 64 + 12]);
  expect(violations(el)).toEqual([]);
});

test("親に幅の指定があれば、その幅いっぱいにそろえる", () => {
  const { graph } = setup(data({ width: 400 }));
  expect(graph.info(2).w).toBe(400 - 24);
  expect(graph.info(1).w).toBe(400);
});

test("リストの子のサイズ・形・子の見せ方は使わず（データはそのまま）、孫は非表示", () => {
  const { el, graph } = setup(data());
  expect([box(graph, 2).shape, box(graph, 2).size, box(graph, 4).childView]).toEqual(["box", "M", "hidden"]);
  expect(box(graph, 2).inList).toBe(true);
  const src = (id: number) => graph.toJSON().nodes.find(n => n.id === id)!;
  expect([src(2).shape, src(2).size, src(4).childView]).toEqual(["person", "S", "tree"]);
  expect(el.querySelector<HTMLElement>('[data-id="5"]')!.style.display).toBe("none");
});

test("リストの外へ出すと、元のサイズ・形・子の見せ方に戻る", () => {
  const { graph } = setup(data());
  graph.reparent(2, null, { x: 600, y: 300 });
  graph.reparent(4, null, { x: 600, y: 500 });
  expect([box(graph, 2).shape, box(graph, 2).size, box(graph, 4).childView, box(graph, 2).inList])
    .toEqual(["person", "S", "tree", false]);
});

test("リストの子どうしの線は描かず、内包に戻すと描く。子は内包のときの位置に戻る", () => {
  const { el, graph } = setup(data());
  const line = () => el.querySelector<SVGElement>(".mz-edge")!.style.display;
  expect(graph.toJSON().edges!.length).toBe(2);
  const edgeOf = (id: string) => el.querySelector<SVGElement>(`.mz-edge[data-id="${id}"]`);
  const e1 = edgeOf("e1") ?? el.querySelectorAll<SVGElement>(".mz-edge")[0]!;
  expect(e1.style.display).toBe("none");
  graph.update(1, { childView: "nest" });
  expect(e1.style.display).toBe("");
  expect([graph.info(3).x, graph.info(3).y]).toEqual([12, 30]);
  expect(line()).toBe("");
});

test("ドラッグで並べ替えると、データの並び順が変わる。Undo で戻る", () => {
  const { el, graph } = setup(data());
  expect(order(graph)).toEqual([1, 2, 3, 4, 5, 6]);
  graph.select(2);
  const head = el.querySelector('[data-id="2"] > .mz-head')!;
  const fire = (type: string, y: number) =>
    head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 0, clientY: y, pointerId: 1 }));
  fire("pointerdown", 0);
  for (let y = 10; y <= 90; y += 10) fire("pointermove", y); // 2 の中心が 3 の中心（72 下）を越える
  fire("pointerup", 90);
  expect(order(graph)).toEqual([1, 3, 2, 4, 5, 6]);
  expect([graph.info(3).y, graph.info(2).y]).toEqual([30, 102]);
  expect(graph.info(1).x).toBe(40); // リスト（親）ごとは動かない
  graph.undo();
  expect(order(graph)).toEqual([1, 2, 3, 4, 5, 6]);
});

test("リストの子どうしは線を引けない", () => {
  const { el, graph } = setup({ nodes: [{ id: 1, childView: "list" }, { id: 2, parent: 1 }, { id: 3, parent: 1 }] });
  graph.setMode("link");
  const click = (id: number) => el.querySelector(`[data-id="${id}"] > .mz-head`)!
    .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ctrlKey: true, pointerId: 1 }));
  click(2); click(3);
  expect(graph.toJSON().edges).toEqual([]);
});

test("サイドバー: 見せ方にリストがあり、リストの子ではサイズと子の見せ方を変えられない", async () => {
  const { createPanel } = await import("../web/src/panel");
  const stage = document.createElement("div"), side = document.createElement("aside");
  document.body.append(side, stage);
  let panel: { show(i: unknown): void } | null = null;
  const graph = createGraph(stage, data(), { measureText: fakeMeasure, onSelect: i => panel?.show(i) });
  graphs.push(graph);
  panel = createPanel(side, graph);
  graph.select(1);
  expect([...side.querySelectorAll<HTMLInputElement>('input[name="mzp-view"]')].map(i => i.value)).toContain("list");
  graph.select(4);
  const disabled = (name: string) => [...side.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].every(i => i.disabled);
  expect([disabled("mzp-size"), disabled("mzp-view")]).toEqual([true, true]);
  expect(side.querySelector('input[name="mzp-shape"]')).toBeNull();
});

test("見出しが子より長ければ、見出しが入る幅にそろえる（上限は 400）", () => {
  const cap = "とても長い見出しのリストです。子より長い"; // 20 文字 → 9 * 20 + 16 = 196
  const { graph } = setup({
    nodes: [{ id: 1, caption: cap, childView: "list", x: 40, y: 40 }, { id: 2, caption: "短", parent: 1 }],
  });
  expect(graph.info(1).w).toBe(196);
  expect(graph.info(2).w).toBe(196 - 24);
  graph.update(1, { caption: "あ".repeat(60) }); // 上限で止める
  expect(graph.info(1).w).toBe(400 + 24);
});
