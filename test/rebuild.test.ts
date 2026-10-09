// 構造が変わる操作（付け替え・ほかのページの箱を消す・戻す・移植）は、どれも履歴に 1 件、知らせを 1 つ出し、
// 動かした箱を選ぶ（graph.ts の rebuildWith。docs/REFACTOR-2.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { copySubtree } from "../web/src/pages";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

const data = (): Diagram => ({
  world: { width: 1000 },
  nodes: [
    { id: 1, caption: "親", x: 40, y: 40 }, { id: 2, caption: "子", parent: 1, x: 12, y: 30 },
    { id: 3, caption: "隣", x: 400, y: 40 },
    { id: 4, caption: "ページ", page: true, x: 40, y: 300 }, { id: 5, caption: "中", parent: 4 },
  ],
  edges: [[1, 3]],
});

function setup() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let changes = 0;
  const notices: string[] = [];
  const graph = createGraph(el, data(), { measureText: fakeMeasure, onChange: () => changes++, onNotice: t => notices.push(t) });
  graphs.push(graph);
  return { graph, count: () => [changes, notices.length], notices };
}

test("付け替え: 履歴 1 件、知らせ 1 つ、動かした箱を選ぶ", () => {
  const { graph, count, notices } = setup();
  const [c0, n0] = count();
  graph.reparent(2, null, { x: 600, y: 200 });
  expect([count()[0]! - c0!, count()[1]! - n0!]).toEqual([1, 1]);
  expect(notices.at(-1)).toBe("最上位へ移しました");
  expect(graph.selected()).toBe("2");
});

test("付け替えで動かない（同じ親）なら、何もしない", () => {
  const { graph, count } = setup();
  const before = count();
  expect(graph.reparent(2, 1)).toBe(false);
  expect(count()).toEqual(before);
});

test("ほかのページの箱を消す: 履歴 1 件、知らせ 1 つ", () => {
  const { graph, count, notices } = setup();
  const [c0, n0] = count();
  graph.remove(5);
  expect([count()[0]! - c0!, count()[1]! - n0!]).toEqual([1, 1]);
  expect(notices.at(-1)).toBe("「5_中」を消しました");
});

test("戻す: 履歴 1 件、知らせ 1 つ、戻した箱を落とした位置に置いて選ぶ", () => {
  const { graph, count, notices } = setup();
  graph.remove(3);
  const [c0, n0] = count();
  graph.restore(3, null, { x: 600, y: 300 });
  expect([count()[0]! - c0!, count()[1]! - n0!]).toEqual([1, 1]);
  expect(notices.at(-1)).toBe("「3_隣」を戻しました");
  expect([graph.selected(), graph.info(3).x, graph.info(3).y]).toEqual(["3", 600, 300]);
});

test("移植: 履歴 1 件、知らせ 1 つ、写した箱を選ぶ", () => {
  const { graph, count, notices } = setup();
  const [c0, n0] = count();
  const root = graph.paste(copySubtree(data(), 1), null, { x: 600, y: 300 }, "別のブック");
  expect([count()[0]! - c0!, count()[1]! - n0!]).toEqual([1, 1]);
  expect(notices.at(-1)).toBe(`「${root}_親」を移植しました（別のブック から、子 1 個）`);
  expect(graph.selected()).toBe(String(root));
});
