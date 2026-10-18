// リストのつまみ（resizers.ts）: 右の縁で幅（docs/SIZE-plan.md の 10 章）、スクロールにしたリストの下の縁で高さの上限（D33）。
// ドラッグの間は開始時の位置から決め直し、手を離したら 1 件の履歴。Undo で戻る
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
import type { Diagram } from "../web/src/types";
import { BOX_VIEWS } from "../web/src/validate";
import { GROUP_MIN } from "../web/src/size-rules";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let changes = 0;
  const graph = createGraph(el, data, { measureText: fakeMeasure, onChange: () => changes++ });
  graphs.push(graph);
  return { el, graph, changes: () => changes };
}
const src = (g: Graph, id: number) => g.toJSON().nodes.find(n => n.id === id)!;

// 箱 id のつまみ（cls）を、(dx, dy) だけ動かして離す
function dragGrip(el: HTMLElement, graph: Graph, id: number, cls: string, dx: number, dy: number) {
  graph.select(id);
  const node = el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!;
  const grip = [...node.querySelectorAll<HTMLElement>(`.${cls}`)].find(g => g.closest(".mz-node") === node)!;
  const fire = (type: string, x: number, y: number) =>
    grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire("pointerdown", 0, 0);
  fire("pointermove", dx / 2, dy / 2);
  fire("pointermove", dx, dy);
  fire("pointerup", dx, dy);
}

// リストの戦略（幅のつまみと、スクロールを持つ並べ方）は表から引く
const LIST = BOX_VIEWS.find(v => STRATEGIES[v].widthGrip && STRATEGIES[v].scroll)!;
const list = (extra: Record<string, unknown> = {}): Diagram => ({
  nodes: [
    { id: 1, caption: "一覧", childView: LIST, x: 40, y: 40, ...extra },
    ...Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, caption: `項目${i + 1}`, parent: 1 })),
    { id: 2, caption: "右の隣", x: 330, y: 40 },
  ],
});

test("リストの幅のつまみ: 右へ広げると width に書き、1 件の履歴。Undo で中身に合わせた幅に戻る", () => {
  const { el, graph, changes } = setup(list());
  const w0 = graph.info(1).w, c0 = changes();
  dragGrip(el, graph, 1, "mz-width-grip", 200, 0);
  expect(src(graph, 1).width).toBe(w0 + 200);
  expect(graph.info(1).w).toBe(w0 + 200);
  // 広げて重なる右の隣は押しのける（重ならない）
  const [a, b] = [graph.info(1), graph.info(2)];
  expect(a.x + a.w <= b.x || b.y >= a.y + a.h).toBe(true);
  expect([b.x, b.y]).not.toEqual([330, 40]);
  expect(changes() - c0).toBe(1);
  graph.undo();
  expect(src(graph, 1).width).toBeUndefined();
  expect(graph.info(1).w).toBe(w0);
});

test("リストの幅のつまみ: 狭める下限はグループの最小の幅（それより狭くは書かない）", () => {
  const { el, graph } = setup(list());
  dragGrip(el, graph, 1, "mz-width-grip", -2000, 0);
  expect(Number(src(graph, 1).width)).toBeGreaterThanOrEqual(GROUP_MIN.w);
});

test("スクロールにしたリストの高さのつまみ: 動かした分だけ listHeight を変え、中身の高さを超えては広げない。Undo で戻る", () => {
  const { el, graph, changes } = setup(list({ listHeight: 150 }));
  expect(graph.info(1).h).toBe(150);
  const c0 = changes();
  dragGrip(el, graph, 1, "mz-height-grip", 0, 60);
  expect(src(graph, 1).listHeight).toBe(210);
  expect(graph.info(1).h).toBe(210);
  expect(changes() - c0).toBe(1);
  dragGrip(el, graph, 1, "mz-height-grip", 0, 5000);
  const full = Number(src(graph, 1).listHeight);
  expect(full).toBeLessThan(5000); // 中身の高さ（fullH）で止まる
  expect(graph.info(1).h).toBe(full);
  graph.undo();
  graph.undo();
  expect(src(graph, 1).listHeight).toBe(150);
});

test("つまみは選択モードのときだけ効く（ほかのモードでは大きさを変えない）", () => {
  const { el, graph } = setup(list());
  graph.setMode("reparent");
  const node = el.querySelector<HTMLElement>('.mz-node[data-id="1"]')!;
  const grip = [...node.querySelectorAll<HTMLElement>(".mz-width-grip")].find(g => g.closest(".mz-node") === node)!;
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", 200);
  fire("pointerup", 200);
  graph.setMode("move");
  expect(src(graph, 1).width).toBeUndefined();
});

test("付箋紙でも、リストの幅のつまみは見えている幅から動かした分だけ変わり、width には土台の幅（補正値を除いた幅）を書く（E1）", () => {
  const { el, graph } = setup({ world: { theme: "sticky" }, ...list() });
  const w0 = graph.info(1).w;
  dragGrip(el, graph, 1, "mz-width-grip", 100, 0);
  expect(graph.info(1).w).toBe(w0 + 100);
  const ox = 8; // 付箋紙の M の補正値（左右 4 ずつ）
  expect(src(graph, 1).width).toBe(w0 + 100 - ox);
  // 標準のテーマに戻すと、土台の幅（書いた width）になる
  graph.update(null, { theme: null });
  expect(graph.info(1).w).toBe(w0 + 100 - ox);
});
