// クラス図の形（docs/CLASS-plan.md）。データの検査、クラスにかかわる変更、描画と大きさ、線の接点
import { afterEach, expect, test } from "bun:test";
import { CLASS_HEAD, CLASS_PAD, CLASS_ROW, type ClassAttr, classEnd, classHeight, cleanMembers, memberY } from "../web/src/classbox";
import { applyClassEdit } from "../web/src/edits";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxData, BoxInfo, Diagram, EdgeData } from "../web/src/types";
import { problems } from "../web/src/validate";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, data, { measureText: fakeMeasure });
  return { el, g: graph };
}

const user = (): BoxData => ({
  id: 1, shape: "class", caption: "User", x: 40, y: 40,
  attrs: [{ name: "id", type: "int", access: "private" }, { name: "groupId", type: "int" }],
  ops: [{ name: "save", type: "void", access: "public" }],
});
const data = (): Diagram => ({
  nodes: [user(), { id: 2, shape: "class", caption: "Group", x: 400, y: 40, attrs: [{ name: "id" }] }, { id: 3, caption: "箱", x: 40, y: 300 }],
  edges: [
    { id: "e1", from: 1, to: 2, fromMember: "groupId", toMember: "id" },
    { id: "e2", from: 3, to: 1, toMember: "save" },
    { id: "e3", from: 3, to: 2 },
  ],
});
const edgeIds = (d: Diagram) => (d.edges as EdgeData[]).map(e => e.id);

test("検査: 子を持つクラス、重なる名前、知らない access、無い属性への線は誤り", () => {
  const d = data();
  expect(problems(d)).toEqual([]);
  d.nodes.push({ id: 4, parent: 1 });
  (d.nodes[0]!.attrs as unknown[]).push({ name: "save" }, { name: "x", access: "secret" });
  (d.edges as EdgeData[]).push({ id: "e4", from: 1, to: 3, fromMember: "nope" }, { id: "e5", from: 3, to: 3, fromMember: "id" });
  expect(problems(d)).toEqual([
    "access に使えるのは public / private / protected / package です: 1 の x (secret)",
    "属性・操作の名前が重なっています: 1 の save",
    "クラスの箱は子を持てません: 4 → 1",
    "fromMember の属性・操作がありません: 1 - 3 (nope)",
    "fromMember はクラスの箱の端にだけ書けます: 3 - 3",
  ]);
});

test("applyClassEdit: 子を持つ箱をクラスにすると子孫は removed へ。本文は捨てる", () => {
  const d: Diagram = {
    nodes: [{ id: 1, caption: "枠", body: "本文", x: 0, y: 0 }, { id: 2, parent: 1 }, { id: 3, parent: 2 }, { id: 4 }],
    edges: [{ id: "e1", from: 2, to: 3 }, { id: "e2", from: 1, to: 4 }],
  };
  expect(applyClassEdit(d, 1, { shape: "class", attrs: [{ name: " id ", type: "", static: false }] })).toEqual({ kids: 2, cut: 1 });
  expect(d.nodes).toEqual([{ id: 1, caption: "枠", x: 0, y: 0, shape: "class", attrs: [{ name: "id" }] }, { id: 4 }]);
  expect(d.removed!.map(s => s.id)).toEqual([2, 3]);
  expect(edgeIds(d)).toEqual(["e2"]);
});

test("applyClassEdit: 名前を変えた行の線は付いて行き、消した行の線は消える。クラスでなくすとクラス名以外を捨てる", () => {
  const d = data();
  applyClassEdit(d, 1, {
    shape: "class", attrs: [{ name: "id" }, { name: "group" }], ops: [], renamed: { groupId: "group" },
  });
  expect((d.edges as EdgeData[]).map(e => [e.id, e.fromMember ?? null, e.toMember ?? null])).toEqual([["e1", "group", "id"], ["e3", null, null]]);
  expect(d.nodes[0]!.ops).toBeUndefined();

  applyClassEdit(d, 2, { shape: "box", caption: "グループ" });
  expect(d.nodes[1]).toEqual({ id: 2, caption: "グループ", x: 400, y: 40 });
  expect((d.edges as EdgeData[])[0]).toEqual({ id: "e1", from: 1, to: 2, fromMember: "group" });
  expect(problems(d)).toEqual([]);
});

test("cleanMembers は名前の無い行と既定の項目を捨てる", () => {
  expect(cleanMembers<ClassAttr>([{ name: "a", type: " int ", static: false, access: undefined }, { name: "  " }])).toEqual([{ name: "a", type: "int" }]);
});

test("描画: クラス名の下に属性と操作の区画。高さは行の数で決まり、static は下線の印、abstract は斜体の印", () => {
  const d = data();
  d.nodes[0]!.abstract = true;
  d.nodes[0]!.attrs![0]!.static = true;
  const { el } = setup(d);
  const head = el.querySelector<HTMLElement>('.mz-node[data-id="1"] > .mz-head')!;
  expect(head.classList.contains("mz-shape-class")).toBe(true);
  expect(head.classList.contains("mz-class-abstract")).toBe(true);
  expect([...head.querySelectorAll(".mz-class-row")].map(r => r.textContent)).toEqual(["- id: int", "groupId: int", "+ save(): void"]);
  expect(head.querySelector(".mz-class-row")!.classList.contains("mz-static")).toBe(true);
  expect(parseFloat(head.style.height)).toBe(classHeight(d.nodes[0]!));
  expect(classHeight(d.nodes[0]!)).toBe(CLASS_HEAD + 2 * (1 + 2 * CLASS_PAD) + 3 * CLASS_ROW);
  expect(memberY(d.nodes[0]!, "save")).toBe(CLASS_HEAD + (1 + 2 * CLASS_PAD + 2 * CLASS_ROW) + 1 + CLASS_PAD + CLASS_ROW / 2);
});

test("線の接点: 行につなぐ線は行の高さで相手のいる側。クラスそのものは 4 つの接点から相手の向きで選ぶ", () => {
  const r = { x: 0, y: 0, w: 100, h: 120 };
  const src = user();
  expect(classEnd(r, src, "groupId", { x: 300, y: 0, w: 50, h: 50 }, null)).toEqual([100, memberY(src, "groupId")!]);
  expect(classEnd(r, src, "groupId", { x: -300, y: 0, w: 50, h: 50 }, null)).toEqual([0, memberY(src, "groupId")!]);
  expect(classEnd(r, src, undefined, { x: 300, y: 0, w: 50, h: 50 }, null)).toEqual([100, CLASS_HEAD / 2]); // 横: クラス名の区画の右
  expect(classEnd(r, src, undefined, { x: 0, y: 400, w: 50, h: 50 }, null)).toEqual([50, 120]);            // 縦: 下の辺の真ん中
  expect(classEnd(r, src, undefined, { x: 300, y: 0, w: 50, h: 50 }, [50, -3])).toEqual([50, 0]);         // 固定の位置は、一番近い接点
});

test("updateClass は履歴に 1 件。クラスの上には付け替えられない", () => {
  const { g } = setup(data());
  g.updateClass(1, { shape: "class", attrs: [{ name: "id" }], ops: [{ name: "save" }] });
  expect(edgeIds(g.toJSON())).toEqual(["e2", "e3"]); // groupId の行を消したので e1 も消える
  expect((g.info(1) as BoxInfo).attrs).toEqual([{ name: "id" }]);
  g.undo();
  expect(edgeIds(g.toJSON())).toEqual(["e1", "e2", "e3"]);
  expect(() => g.reparent(3, 1)).toThrow("クラスの箱は子を持てません");
});

test("子を持つ箱をクラスにすると、子は消したものの一覧へ移り、知らせが出る", () => {
  const events: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, { nodes: [{ id: 1, caption: "枠" }, { id: 2, parent: 1 }, { id: 3, parent: 1 }] }, {
    measureText: fakeMeasure, onEvent: ev => events.push(ev.kind),
  });
  graph.updateClass(1, { shape: "class" });
  expect(graph.toJSON().nodes).toEqual([expect.objectContaining({ id: 1, shape: "class" })]);
  expect(graph.items().removed.map(i => i.id)).toEqual(["2", "3"]);
  expect(events).toContain("classKids");
});
