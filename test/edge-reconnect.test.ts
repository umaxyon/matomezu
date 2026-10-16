// 線の端のつなぎ替え（残課題 E12。graph-edges.ts の canReconnect・reconnect、interaction.ts の endGesture）。
// 選んだ線の端の丸をほかの箱の上へ運んで離すと、その箱につなぎ替える。決まりは線を引くときと同じ（同じ階層・同じ組は 1 本）。
// happy-dom には位置から要素を引く仕組みが無いので、離す所の箱は document.elementsFromPoint を差し替えて渡す
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram, EdgeData } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
const original = document.elementsFromPoint;
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
  document.elementsFromPoint = original;
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let changes = 0;
  const graph = createGraph(el, data, { measureText: fakeMeasure, onChange: () => changes++ });
  graphs.push(graph);
  return { el, graph, changes: () => changes };
}
const edgesOf = (g: Graph) => (g.toJSON().edges ?? []) as EdgeData[];

// 線 id を選び、端 end の丸をつかんで、箱 to（null なら何も無い所）の上で離す
function dragEndTo(el: HTMLElement, graph: Graph, id: string, end: "exit" | "enter", to: number | null) {
  graph.selectEdge(id);
  const dot = el.querySelector<SVGElement>(`.mz-edge.mz-selected .mz-end[data-end="${end}"]`)!;
  const target = to == null ? null : el.querySelector<HTMLElement>(`.mz-node[data-id="${to}"]`)!;
  document.elementsFromPoint = () => (target ? [target.querySelector(".mz-head") ?? target, target] : []);
  const fire = (type: string, x: number, y: number) =>
    dot.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire("pointerdown", 100, 70);
  fire("pointermove", 300, 300);
  fire("pointerup", 300, 300);
}

// 1・2・3 は最上位、4 は 3 の子（階層が違う）。e1 は 1 → 2（キャプション・矢印・破線・手で直した区間つき）、e2 は 1 → 3
const data = (): Diagram => ({
  nodes: [
    { id: 1, caption: "一", x: 40, y: 40 }, { id: 2, caption: "二", x: 400, y: 40 },
    { id: 3, caption: "三", x: 40, y: 300 }, { id: 4, caption: "四", parent: 3 },
    { id: 5, caption: "五", x: 400, y: 300 },
  ],
  edges: [
    { id: "e1", from: 1, to: 2, caption: "呼ぶ", arrow: "both", dash: "dashed", route: "elbow", enterAt: 0.1 },
    { id: "e2", from: 1, to: 3 },
  ],
});

test("終点を同じ階層の別の箱へ運んで離すと、つなぎ替える。キャプション・矢印・線の種類は残し、終点の位置は離した所の近くに固定し直す。履歴 1 件で Undo で戻る", () => {
  const { el, graph, changes } = setup(data());
  const c0 = changes();
  dragEndTo(el, graph, "e1", "enter", 5);
  const e = edgesOf(graph).find(x => x.id === "e1")!;
  expect([e.from, e.to, e.caption, e.arrow, e.dash, e.route]).toEqual([1, 5, "呼ぶ", "both", "dashed", "elbow"]);
  expect(typeof e.enterAt).toBe("number");
  expect(e.enterAt).not.toBe(0.1);
  expect(e.via).toBeUndefined();
  expect(changes() - c0).toBe(1);
  graph.undo();
  expect(edgesOf(graph).find(x => x.id === "e1")).toEqual((data().edges as EdgeData[]).find(x => x.id === "e1"));
});

test("始点もつなぎ替えられる（from が変わり、もう一方の端はそのまま）", () => {
  const { el, graph } = setup(data());
  dragEndTo(el, graph, "e1", "exit", 5);
  const e = edgesOf(graph).find(x => x.id === "e1")!;
  expect([e.from, e.to]).toEqual([5, 2]);
});

test("つなぎ替えられない相手（階層が違う箱・同じ組の線がもうある箱）の上で離しても、つなぎ替えない", () => {
  const { el, graph } = setup(data());
  dragEndTo(el, graph, "e1", "enter", 4); // 4 は 3 の子（階層が違う）。外へたどって 3 に付け替えたいが、1 → 3 は e2 がある
  expect(edgesOf(graph).find(x => x.id === "e1")!.to).toBe(2);
  dragEndTo(el, graph, "e1", "enter", 3); // 1 → 3 は e2 がある
  expect(edgesOf(graph).find(x => x.id === "e1")!.to).toBe(2);
});

test("もう一方の端と同じ箱の上で離すと、自分に戻る線になる（手で直した区間は捨て、キャプションは残す）", () => {
  const { el, graph } = setup(data());
  dragEndTo(el, graph, "e1", "enter", 1);
  const e = edgesOf(graph).find(x => x.id === "e1")!;
  expect([e.from, e.to]).toEqual([1, 1]);
  expect(e.via).toBeUndefined();
  expect(e.caption).toBe("呼ぶ");
});

test("何も無い所で離せば、端を今の箱の縁に沿って動かすだけ（つなぎ替えない）", () => {
  const { el, graph } = setup(data());
  dragEndTo(el, graph, "e1", "enter", null);
  const e = edgesOf(graph).find(x => x.id === "e1")!;
  expect([e.from, e.to]).toEqual([1, 2]);
  expect(typeof e.enterAt).toBe("number");
});
