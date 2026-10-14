// 子の見せ方「リスト」（docs/LIST-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure, violations } from "./helpers";
import { LINK_LOOK_DEFS } from "../web/src/link-box";
import { ROW_HEIGHTS } from "../web/src/model";
import { SIZES } from "../web/src/validate";

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
// 1 はリスト。2 は S の人、3 は長い文字、4 は子（5）を持つ箱（内包）。内包のときの位置をデータに持つ
const data = (extra: Partial<Diagram["nodes"][number]> = {}): Diagram => ({
  world: { width: 1000 },
  nodes: [
    { id: 1, caption: "一覧", x: 40, y: 40, childView: "list", ...extra },
    { id: 2, caption: "短い", parent: 1, size: "S", shape: "person", x: 300, y: 30 },
    { id: 3, caption: LONG, parent: 1, x: 12, y: 30 },
    { id: 4, caption: "孫あり", parent: 1, x: 12, y: 200 },
    { id: 5, caption: "孫", parent: 4 },
    { id: 6, caption: "隣", x: 400, y: 40 },
  ],
  edges: [[2, 3], [1, 6]],
});
const box = (g: Graph, id: number) => g.info(id) as BoxInfo;
const rect = (g: Graph, id: number) => { const i = g.info(id); return [i.x, i.y, i.w, i.h]; };
const order = (g: Graph) => g.toJSON().nodes.map(n => n.id);

test("子を縦に並べ、一番広い子の幅にそろえる。親は中身に合わせる。子を持つ子は中身の縮図を出す行になり、そろえた幅に広げる（D13）", () => {
  const { el, graph } = setup(data());
  const [a, b, c] = [graph.info(2), graph.info(3), graph.info(4)];
  expect(new Set([a.w, b.w, c.w]).size).toBe(1);
  expect([a.x, b.x, c.x]).toEqual([12, 12, 12]);
  expect(a.y < b.y && b.y < c.y).toBe(true);
  expect(c.h).toBe(LINK_LOOK_DEFS.side.win.h + 2 * LINK_LOOK_DEFS.side.gap); // 縮図の行の高さ
  expect(rect(graph, 1)).toEqual([40, 40, a.w + 24, c.y + c.h + 12]);
  expect(violations(el)).toEqual([]);
});

test("リストの幅の指定（width）があれば、L の最大を超えてもその幅にし、葉の子はその幅で折り返す。null で中身に合わせる（docs/SIZE-plan.md の 10 章）", () => {
  const long = LONG.repeat(6); // 1 行で 9 * 144 + 16 = 1312（L の最大 400 を超える）
  const d = (extra = {}): Diagram => ({ nodes: [{ id: 1, childView: "list", x: 40, y: 40, ...extra }, { id: 2, caption: long, parent: 1, size: "L" }] });
  const auto = setup(d()).graph;
  expect(auto.info(2).w).toBe(SIZES.M.maxW); // 指定が無ければ、葉の子は普通の大きさの最大で折り返す（リストの子は箱のサイズを使わない。D13）
  const { graph } = setup(d({ width: 1400 }));
  expect([graph.info(1).w, graph.info(2).w]).toEqual([1400, 1400 - 24]);
  expect(graph.info(2).h).toBeLessThan(auto.info(2).h); // 広い幅で折り返すので低くなる
  graph.update(1, { width: null });
  expect(graph.info(1).w).toBe(auto.info(1).w);
  expect(graph.toJSON().nodes[0]!.width).toBeUndefined();
  graph.update(1, { width: 700 });
  expect([graph.info(1).w, graph.toJSON().nodes[0]!.width]).toEqual([700, 700]);
});

test("リストの幅の指定は、子を持つ子の幅より狭くできない。葉の子は狭めた幅で折り返す", () => {
  const { graph } = setup(data({ width: 60 }));
  expect(graph.info(1).w).toBe(graph.info(4).w + 24); // 子を持つ子（ツリー）の幅が下限
  expect(graph.info(1).w).toBeLessThan(setup(data()).graph.info(1).w);
  expect(graph.info(3).w).toBe(graph.info(1).w - 24); // 葉の子は狭めた幅にそろい、その幅で折り返す
  expect(graph.toJSON().nodes[0]!.width).toBe(60);    // データはそのまま
});

test("リストの子は形を使わず（データはそのまま）、子を持つ子も子の見せ方のデータは変えずに縮図で見せる（D13）", () => {
  const { el, graph } = setup(data());
  expect([box(graph, 2).shape, box(graph, 2).size, box(graph, 4).childView]).toEqual(["box", "S", "nest"]);
  expect(box(graph, 2).inList).toBe(true);
  const src = (id: number) => graph.toJSON().nodes.find(n => n.id === id)!;
  expect([src(2).shape, src(2).size, src(4).childView]).toEqual(["person", "S", undefined]);
  expect(el.querySelector<HTMLElement>('[data-id="5"]')!.style.display).toBe("none");
});

test("リストの子は箱のサイズ（L / M / S）を使わず普通の大きさで描き、高さはリストの高さ（中身が収まらない行だけ高い）。S の 10 文字の切り詰めはしない（D13）", () => {
  const head = (el: HTMLElement, id: number) => el.querySelector<HTMLElement>(`[data-id="${id}"] > .mz-head`)!;
  const { el, graph } = setup({
    nodes: [
      { id: 1, caption: "一覧", childView: "list", previewSide: "none", rowSize: "S", x: 40, y: 40 },
      { id: 2, caption: "あ".repeat(20), parent: 1, size: "S" }, { id: 3, caption: "小", parent: 1, size: "S" }, { id: 4, caption: "大", parent: 1, size: "L" },
      { id: 5, caption: "本文あり", body: "一行目\n二行目\n三行目\n四行目", parent: 1 },
    ],
  });
  expect([2, 3, 4].map(id => head(el, id).classList.contains("mz-size-M"))).toEqual([true, true, true]);
  expect(head(el, 2).textContent).toContain("あ".repeat(20));
  expect(graph.info(3).h).toBe(ROW_HEIGHTS.S);
  expect(graph.info(4).h).toBe(ROW_HEIGHTS.S);
  expect(graph.info(5).h).toBeGreaterThan(ROW_HEIGHTS.S); // 本文の分だけ高い（ほかの行は高くならない）
  graph.update(1, { rowSize: "L" });
  expect(graph.info(3).h).toBe(ROW_HEIGHTS.L);
  graph.update(1, { previewSide: "right" }); // 縮図を出すときはいつも L
  graph.update(1, { rowSize: "S" });
  expect(graph.info(3).h).toBe(ROW_HEIGHTS.L);
  graph.update(1, { rowSize: "M" });
  expect(graph.toJSON().nodes[0]!.rowSize).toBeUndefined(); // M は既定なのでデータから消す
});

test("リストの外へ出すと、元のサイズ・形・子の見せ方に戻る", () => {
  const { graph } = setup(data());
  graph.reparent(2, null, { x: 600, y: 300 });
  graph.reparent(4, null, { x: 600, y: 500 });
  expect([box(graph, 2).shape, box(graph, 2).size, box(graph, 4).childView, box(graph, 2).inList])
    .toEqual(["person", "S", "nest", false]);
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
  const { el, graph } = setup(data({ previewSide: "none" }));
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
  const { graph } = setup({ nodes: [{ id: 1, childView: "list" }, { id: 2, parent: 1 }, { id: 3, parent: 1 }] });
  expect(graph.link(2, 3)).toBe(false);
  expect(graph.toJSON().edges).toEqual([]);
});

test("編集ダイアログの子の見せ方にリストがあり、リストの子でも子の見せ方を変えられる。子を内包する子はサイズを選べない", async () => {
  const { openEditDialog } = await import("../web/src/edit-dialog");
  const stage = document.createElement("div");
  document.body.append(stage);
  const graph = createGraph(stage, data(), { measureText: fakeMeasure });
  graphs.push(graph);
  const inputs = (name: string) => [...document.querySelectorAll<HTMLInputElement>(`.mz-dlg-overlay input[name="${name}"]`)];
  const cancel = () => document.querySelector<HTMLElement>(".mz-dlg-overlay [data-cancel]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  openEditDialog(graph, "1");
  expect(inputs("view").map(i => i.value)).toContain("list");
  cancel();
  const sizesOff = (id: number) => {
    openEditDialog(graph, String(id));
    const off = inputs("size").every(i => i.disabled);
    cancel();
    return off;
  };
  // 子を内包している子はサイズを使わない（大きさは子の並びで決まる）が、子の見せ方は変えられる
  expect(sizesOff(4)).toBe(true);
  openEditDialog(graph, "4");
  expect(inputs("view").length).toBe(3);
  expect(inputs("view").every(i => i.disabled)).toBe(false);
  cancel();
  expect(sizesOff(3)).toBe(false); // 葉の子はサイズを変えられる
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

test("ページのある図でも、並べ替えたとおりにデータの並び順が変わる（ほかの箱のデータは動かない）", () => {
  // 2 はページ p1 に載っている（最初のページには描かれない）。3 はリスト
  const { el, graph } = setup({
    pages: [{ id: "p1" }],
    nodes: [
      { id: 1, caption: "表", x: 400, y: 40 }, { id: 2, caption: "中", page: "p1" },
      { id: 3, caption: "一覧", childView: "list", previewSide: "none", x: 40, y: 40 },
      { id: 4, caption: "a", parent: 3 }, { id: 5, caption: "b", parent: 3 },
    ],
  });
  const head = el.querySelector('[data-id="4"] > .mz-head')!;
  const fire = (type: string, y: number) =>
    head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 0, clientY: y, pointerId: 1 }));
  fire("pointerdown", 0);
  for (let y = 10; y <= 90; y += 10) fire("pointermove", y);
  fire("pointerup", 90);
  expect(graph.toJSON().nodes.map(n => n.id)).toEqual([1, 2, 3, 5, 4]);
});

test("リストの並べ替えの最中は dragging() が true（外部の変更を手を離すまで待つ）", () => {
  const { el, graph } = setup(data());
  const head = el.querySelector('[data-id="2"] > .mz-head')!;
  head.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }));
  expect(graph.dragging()).toBe(true);
  head.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }));
  expect(graph.dragging()).toBe(false);
});

// リストの子の縮図（D13。2026-10-14 ユーザー）
test("リストの子が子を持てば、孫を描かずに中身の縮図を右に出す（データの childView は変えない）。出さないにすると縮図の無い低い行と ▼ になる", () => {
  const { el, graph } = setup(data());
  const head = (id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head`)!;
  const shown = (id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!.style.display !== "none";
  expect(head(4).classList.contains("mz-link-row")).toBe(true);
  expect(head(4).classList.contains("mz-link-left")).toBe(false);
  expect(shown(5)).toBe(false);
  expect(box(graph, 4).childView).toBe("nest");
  expect(box(graph, 1).previewSide).toBe("right");
  // 縮図の行も、ほかの子と同じ幅にそろう
  expect(rect(graph, 4)[2]).toBe(rect(graph, 3)[2]);
  graph.update(1, { previewSide: "left" });
  expect(head(4).classList.contains("mz-link-left")).toBe(true);
  const tall = graph.info(4).h;
  graph.update(1, { previewSide: "none" });
  expect(head(4).classList.contains("mz-link-row")).toBe(false);
  expect(shown(5)).toBe(false);
  expect(el.querySelector<HTMLElement>('.mz-node[data-id="4"] .mz-more')!.hidden).toBe(false);
  expect(graph.info(4).h).toBeLessThan(tall);
  expect(violations(el)).toEqual([]);
  // 右は既定なのでデータから消す
  graph.update(1, { previewSide: "right" });
  expect(graph.toJSON().nodes.find(n => n.id === 1)!.previewSide).toBeUndefined();
});

test("非表示にした子は縮図にせず ▼ のまま。リストの中の窓（リンクの箱）は横に分ける見せ方になる", () => {
  const { el } = setup({
    pages: [{ id: "p1", title: "別のページ" }],
    nodes: [
      { id: 1, caption: "一覧", childView: "list", x: 40, y: 40 },
      { id: 2, caption: "畳んだ", parent: 1, childView: "hidden" },
      { id: 3, caption: "孫", parent: 2 },
      { id: 4, caption: "窓", parent: 1, link: "p1" },
      { id: 9, caption: "向こう", page: "p1", x: 0, y: 0 },
    ],
  });
  const head = (id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head`)!;
  expect(head(2).classList.contains("mz-link-row")).toBe(false);
  expect(head(4).classList.contains("mz-link-side")).toBe(true);
  expect(head(4).classList.contains("mz-link-window")).toBe(false);
});

test("縮図を出さないリストの中の窓は、縮図の代わりに開くアイコンを出し、行は低くなる（D13）", () => {
  const d = (side: "right" | "none"): Diagram => ({
    pages: [{ id: "p1", title: "別のページ" }],
    nodes: [
      { id: 1, caption: "一覧", childView: "list", previewSide: side, x: 40, y: 40 },
      { id: 4, caption: "窓", parent: 1, link: "p1" }, { id: 5, caption: "葉", parent: 1 },
      { id: 9, caption: "向こう", page: "p1", x: 0, y: 0 },
    ],
  });
  const withPreview = setup(d("right")), { el, graph } = setup(d("none"));
  const head = el.querySelector<HTMLElement>('.mz-node[data-id="4"] > .mz-head')!;
  expect(head.classList.contains("mz-link-icon")).toBe(true);
  expect(head.querySelector(".mz-link-art")!.childElementCount).toBe(0);
  expect(graph.info(4).h).toBeLessThan(withPreview.graph.info(4).h);
  expect(graph.info(4).w).toBe(graph.info(5).w);
  expect(violations(el)).toEqual([]);
});
