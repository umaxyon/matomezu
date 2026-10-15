// コピー・貼り付け（D23。2026-10-15 ユーザー）: 選んだ箱を子孫と中の線ごと写し、ワールドを選んでいればポインタの位置（無ければ見えている範囲の真ん中）、
// 箱を選んでいればその中の左上、子を入れられない箱なら隣に貼る。決まりはページのパターンが持つ（STRATEGIES の copy）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { noticeOf } from "../web/src/notices";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

const data = (): Diagram => ({
  pages: [{ id: "f", title: "流れ", world: { childView: "flow" } }, { id: "t", title: "木", world: { childView: "tree", root: 20 } }],
  nodes: [
    { id: 1, caption: "親", x: 40, y: 40 }, { id: 2, caption: "子", parent: 1, x: 12, y: 30 }, { id: 3, caption: "孫", parent: 2 },
    { id: 4, caption: "入れ物", x: 400, y: 40 }, { id: 5, caption: "中", parent: 4 },
    { id: 10, caption: "開始", page: "f", x: 40, y: 40 }, { id: 11, caption: "処理", page: "f", x: 40, y: 200 },
    { id: 20, caption: "根", page: "t" },
  ],
  edges: [{ from: 2, to: 2 }, { from: 1, to: 4 }, { from: 10, to: 11 }],
});

function setup() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let changes = 0;
  const notices: string[] = [];
  const graph = createGraph(el, data(), { measureText: fakeMeasure, onChange: () => changes++, onEvent: ev => notices.push(noticeOf(ev)) });
  graphs.push(graph);
  return { graph, changes: () => changes, notices };
}
const node = (g: Graph, id: string | number | null) => g.toJSON().nodes.find(n => String(n.id) === String(id))!;

test("ワールドを選んで貼ると最上位に置き、子孫と中の線ごと写す。外の箱への線は写さない。履歴 1 件で、貼った箱を選ぶ", () => {
  const { graph, changes, notices } = setup();
  graph.select(1);
  expect(graph.copySelected()).toBe(true);
  expect(notices.at(-1)).toBe("「1_親」をコピーしました（子 2 個）");
  graph.select(null);
  const c0 = changes();
  expect(graph.pasteClip()).toBe(true);
  expect(changes() - c0).toBe(1);
  const id = graph.selected()!;
  expect(id).not.toBe("1");
  const d = graph.toJSON();
  const top = node(graph, id);
  expect([top.caption, top.parent ?? null, top.page ?? null, top.userAdded]).toEqual(["親", null, null, true]);
  const kid = d.nodes.find(n => String(n.parent) === id)!;
  expect(kid.caption).toBe("子");
  expect(d.nodes.some(n => String(n.parent) === String(kid.id) && n.caption === "孫")).toBe(true);
  // 子の自分に戻る線は写し、外の箱（4）への線は写さない
  const edges = (d.edges ?? []).map(e => (Array.isArray(e) ? { from: e[0], to: e[1] } : e));
  expect(edges.filter(e => String(e.from) === String(kid.id))).toHaveLength(1);
  expect(edges.filter(e => String(e.from) === id)).toHaveLength(0);
  expect(notices.at(-1)).toBe(`「${id}_親」を貼り付けました（子 2 個、線 1 本）`);
});

test("箱を選んで貼ると、その箱の中に入る（写した箱を選んだままなら、その箱自身の中）", () => {
  const { graph } = setup();
  graph.select(4);
  graph.copySelected();
  expect(graph.pasteClip()).toBe(true);
  const id = graph.selected()!;
  expect(String(node(graph, id).parent)).toBe("4");
  expect(node(graph, id).caption).toBe("入れ物");
});

test("フローチャートのページでは、箱は子を持てないので選んだ箱の隣（同じ最上位の、すぐ右）に貼る", () => {
  const { graph } = setup();
  graph.setPage("f");
  graph.select(11);
  graph.copySelected();
  expect(graph.pasteClip()).toBe(true);
  const id = graph.selected()!;
  const s = node(graph, id);
  expect([s.caption, s.parent ?? null, s.page]).toEqual(["処理", null, "f"]);
  expect(Number(s.x)).toBeGreaterThan(Number(node(graph, "11").x));
});

test("パターンの違うページへは貼らない（知らせて断る）。マスターでなくても、写していなければ貼らない", () => {
  const { graph, changes } = setup();
  expect(graph.pasteClip()).toBe(false); // まだ写していない
  graph.select(1);
  graph.copySelected();
  graph.setPage("f");
  graph.select(null);
  const c0 = changes();
  expect(graph.pasteClip()).toBe(false);
  expect(changes()).toBe(c0);
});

test("マスターのパターンでは箱を写さない（ブックの窓の複製は別の決まり。STRATEGIES の copy が books）", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, { world: { childView: "master" }, nodes: [{ id: "user", caption: "ユーザー", childView: "list" }], edges: [] }, { measureText: fakeMeasure });
  graphs.push(graph);
  graph.select("user");
  expect(graph.copySelected()).toBe(false);
});
