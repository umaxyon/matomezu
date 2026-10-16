// 描いていないページ・リストの子の中身の縮図を、画面の外で並べて作る道（page-scenes.ts の sceneLayout。D13）。
// 届くまでは空の絵（前の絵があればそれ）、届いたら覚えて描き直す。同じものを並べている間は頼み直さない。失敗したら次に頼み直す
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { Scene } from "../web/src/preview-art";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

const tick = () => new Promise(r => setTimeout(r, 5));
const sceneWith = (n: number): Scene => ({ w: 100, h: 50, bg: null, edges: [], boxes: Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, w: 8, h: 8, color: null, outline: false })) });

function setup(data: Diagram, layout: (data: Diagram, page: string | null, without?: string) => Promise<Scene>) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const calls: { page: string | null; without?: string }[] = [];
  const graph = createGraph(el, data, {
    measureText: fakeMeasure,
    sceneLayout: (d, page, without) => { calls.push({ page, without }); return layout(d, page, without); },
  });
  graphs.push(graph);
  return { graph, calls };
}

const book = (): Diagram => ({
  pages: [{ id: "p1", title: "別" }],
  nodes: [{ id: 1, caption: "窓", link: "p1", x: 40, y: 40 }, { id: 2, caption: "向こう", page: "p1", x: 40, y: 40 }],
});

test("描いていないページの縮図は、届くまで空の絵。並べている間は頼み直さず、届いたらその絵を使う", async () => {
  const { graph, calls } = setup(book(), async () => sceneWith(3));
  expect(graph.pageScene("p1").boxes).toHaveLength(0);
  graph.pageScene("p1");
  await tick();
  expect(calls.filter(c => c.page === "p1")).toHaveLength(1);
  expect(graph.pageScene("p1").boxes).toHaveLength(3);
  expect(calls.filter(c => c.page === "p1")).toHaveLength(1); // 覚えた絵を使う
});

test("並べるのに失敗したら、次に求めたときに頼み直す", async () => {
  let fail = true;
  const { graph, calls } = setup(book(), async () => { if (fail) throw new Error("x"); return sceneWith(2); });
  graph.pageScene("p1");
  await tick();
  fail = false;
  expect(graph.pageScene("p1").boxes).toHaveLength(0);
  await tick();
  expect(calls.filter(c => c.page === "p1").length).toBeGreaterThanOrEqual(2);
  expect(graph.pageScene("p1").boxes).toHaveLength(2);
});

test("ページのデータが変わったら頼み直し、届くまでは前の絵を出す", async () => {
  let n = 3;
  const { graph, calls } = setup(book(), async () => sceneWith(n));
  graph.pageScene("p1");
  await tick();
  n = 5;
  const before = calls.filter(c => c.page === "p1").length;
  graph.remove(2); // 見ていないページの箱を消す（データだけが変わる）
  expect(graph.pageScene("p1").boxes).toHaveLength(3); // 届くまでは前の絵
  await tick();
  expect(calls.filter(c => c.page === "p1").length).toBe(before + 1);
  expect(graph.pageScene("p1").boxes).toHaveLength(5);
});

test("リストの子が子を持てば、その箱の中身だけを並べて縮図にする（without にその箱の id）", async () => {
  const data: Diagram = {
    nodes: [
      { id: 1, caption: "一覧", childView: "list", x: 40, y: 40 },
      { id: 2, caption: "子あり", parent: 1 }, { id: 3, caption: "孫", parent: 2 },
    ],
  };
  const { calls } = setup(data, async () => sceneWith(1));
  await tick();
  const call = calls.find(c => c.without === "2");
  expect(call).toBeTruthy();
  expect(call!.page).toBeNull();
});
