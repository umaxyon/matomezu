// ブックとページ（docs/TABS-plan.md 3.2）。図はブック全体を持ち、描くのは 1 ページだけ
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { pageMembers, pageOf, subtreeIds } from "../web/src/pages";
import type { BoxData, Diagram, EdgeData } from "../web/src/types";
import { validate } from "../web/src/validate";
import { dragBy, fakeMeasure } from "./helpers";

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

// 最初のページ: 1（ページの箱）、2、6。1 のページ: 3、4（4 は 5 を内包）。線は 1-2（最初のページ）、3-4（1 のページ）
const book = (): Diagram => ({
  world: { width: 900, background: "#ffffff" },
  nodes: [
    { id: 1, caption: "詳細", page: true, x: 40, y: 40, world: { background: "#101010" } },
    { id: 2, caption: "隣", x: 400, y: 40 },
    { id: 3, caption: "中A", parent: 1, x: 20, y: 20 },
    { id: 4, caption: "中B", parent: 1, x: 300, y: 20 },
    { id: 5, caption: "孫", parent: 4, x: 12, y: 30 },
    { id: 6, caption: "下", x: 40, y: 300 },
  ],
  edges: [
    { id: "e1", from: 1, to: 2 },
    { id: "e2", from: 3, to: 4 },
  ],
});

const drawn = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".mz-node")].map(n => n.dataset.id).sort();
const node = (d: Diagram, id: number) => d.nodes.find(n => n.id === id)!;
const edgeIds = (d: Diagram) => (d.edges as EdgeData[]).map(e => e.id);

test("ページの関数: 箱の載っているページ、ページの箱の中身、子孫", () => {
  const n = book().nodes;
  expect(pageOf(n, 1)).toBeNull();
  expect(pageOf(n, 3)).toBe("1");
  expect(pageOf(n, 5)).toBe("1");
  expect(pageMembers(n, null)).toEqual(["1", "2", "6"]);
  expect(pageMembers(n, "1")).toEqual(["3", "4", "5"]);
  expect([...subtreeIds(n, 1)].sort()).toEqual(["1", "3", "4", "5"]);
});

test("最初のページでは、ページの箱の中身を描かない。保存しても中身と線はそのまま残る", () => {
  const { el, graph } = setup(book());
  expect(graph.page()).toBeNull();
  expect(drawn(el)).toEqual(["1", "2", "6"]);
  const out = graph.toJSON();
  expect(out.nodes).toEqual(book().nodes as BoxData[]);
  expect(edgeIds(out)).toEqual(["e1", "e2"]);
});

test("ページを描くと、ページの箱の子が最上位に並び、ワールドの設定はページの箱のものになる", () => {
  const { el, graph } = setup(book());
  graph.setPage(1);
  expect(graph.page()).toBe("1");
  expect(drawn(el)).toEqual(["3", "4", "5"]);
  expect(graph.info(null).children.map(c => c.id)).toEqual(["3", "4"]);
  const w = graph.info(null);
  expect(w.kind === "world" && w.background).toBe("#101010");
  expect(graph.toJSON().nodes).toEqual(book().nodes as BoxData[]);
});

test("ページの中で動かしても、ほかのページの箱と線は変わらない", () => {
  const { el, graph } = setup(book());
  graph.setPage(1);
  dragBy(el, graph, 3, 0, 200);
  const out = graph.toJSON();
  expect(node(out, 3).y).toBeGreaterThan(20);
  for (const id of [1, 2, 6]) expect(node(out, id)).toEqual(node(book(), id));
  expect(edgeIds(out)).toEqual(["e1", "e2"]);
});

test("ページの背景を変えると、ページの箱の world に書き、ファイルの world は変えない", () => {
  const { graph } = setup(book());
  graph.setPage(1);
  graph.update(null, { background: "#202020" });
  const out = graph.toJSON();
  expect(node(out, 1).world).toEqual({ background: "#202020" });
  expect(out.world).toEqual({ width: 900, background: "#ffffff" });
});

test("ページの中で最上位へ付け替えると、ページの箱の子になる", () => {
  const { graph } = setup(book());
  graph.setPage(1);
  graph.reparent(5, null, { x: 40, y: 200 });
  expect(node(graph.toJSON(), 5).parent).toBe(1);
  expect(graph.info(null).children.map(c => c.id)).toContain("5");
});

test("ページの中で消して戻すと、戻した先はページの箱の子", () => {
  const { graph } = setup(book());
  graph.setPage(1);
  graph.remove(3);
  graph.restore(3, null, { x: 20, y: 200 });
  const out = graph.toJSON();
  expect(node(out, 3).parent).toBe(1);
  expect(out.removed).toBeUndefined();
});

test("新しい線の id は、ほかのページの線と重ならない", () => {
  const { el, graph } = setup(book());
  // 最初のページには e1 だけが見えている。e2 はページ 1 の線
  const click = (id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head`)!
    .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ctrlKey: true, pointerId: 1 }));
  graph.setMode("link");
  click(2);
  click(6);
  // 空いている番号は e2 だが、ページ 1 の線が使っているので e3 になる
  expect(edgeIds(graph.toJSON())).toEqual(["e1", "e2", "e3"]);
});

test("最初のページでページの箱を消すと、中身も消え、中の線も消える", () => {
  const { graph } = setup(book());
  graph.remove(1);
  const out = graph.toJSON();
  expect(out.nodes.map(n => n.id)).toEqual([2, 6]);
  expect((out.removed ?? []).map(n => n.id).sort()).toEqual([1, 3, 4, 5]);
  expect(out.edges).toEqual([]);
});

test("ページを切り替えても Undo の履歴は 1 つ。戻すとページの中の変更も戻る", () => {
  const { graph } = setup(book());
  graph.setPage(1);
  graph.update(3, { caption: "変えた" });
  graph.setPage(null);
  expect(node(graph.toJSON(), 3).caption).toBe("変えた");
  graph.undo();
  expect(node(graph.toJSON(), 3).caption).toBe("中A");
  expect(graph.page()).toBeNull();
});

test("描いていたページの箱が無くなったら、最初のページに戻る", () => {
  const { el, graph } = setup(book());
  graph.setPage(1);
  const next = book();
  delete node(next, 1).page;
  graph.load(next, { keepHistory: true });
  expect(graph.page()).toBeNull();
  expect(drawn(el)).toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("ページでない箱はページとして描けない", () => {
  const { graph } = setup(book());
  expect(() => graph.setPage(2)).toThrow();
  expect(graph.page()).toBeNull();
});

test("ページは入れ子にできない（読み込みエラー）", () => {
  const d = book();
  node(d, 4).page = true;
  expect(() => validate(d)).toThrow(/ページの中の箱はページにできません/);
});

test("pages はブックのページの箱の一覧", () => {
  const { graph } = setup(book());
  expect(graph.pages()).toEqual([{ id: "1", caption: "詳細" }]);
});
