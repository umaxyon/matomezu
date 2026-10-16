// 見え方の操作（graph-view.ts。D32・D5）: 編集中の倍率とプレビューの倍率、手のひら（見る範囲を動かすだけ）、プレビュー中は図を直さない
import { afterEach, expect, test } from "bun:test";
import { type Graph, createGraph } from "../web/src/graph";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => { graph?.destroy(); graph = null; document.body.innerHTML = ""; });

function setup() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }, { id: 2, caption: "隣", x: 400, y: 40 }] }, { measureText: fakeMeasure, margin: 300 });
  const world = el.querySelector<HTMLElement>(".mz-world")!;
  return { el, graph, world };
}
const fireOn = (target: Element, type: string, x: number, y: number) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 }));
const head = (el: HTMLElement, id: number) => el.querySelector(`.mz-node[data-id="${id}"] > .mz-head`)!;

test("プレビュー中に編集中の倍率を変えても見た目は変えず、プレビューを抜けるとその倍率になる", () => {
  const { graph, world } = setup();
  graph.setPreview(2);
  graph.setZoom(1.25);
  expect(world.style.transform).toBe("scale(2)");
  expect(graph.zoom()).toBe(1.25);
  graph.setPreview(null);
  expect(world.style.transform).toBe("scale(1.25)");
  expect(graph.view().zoom).toBe(1.25);
});

test("手のひらのモード: 箱を押しても選ばず動かさない。ドラッグすると見る範囲が付いてくる", () => {
  const { el, graph } = setup();
  graph.home();
  const [l0, t0] = [el.scrollLeft, el.scrollTop];
  graph.setMode("pan");
  fireOn(head(el, 1), "pointerdown", 100, 100);
  document.dispatchEvent(new PointerEvent("pointermove", { clientX: 60, clientY: 80, pointerId: 1 }));
  expect([el.scrollLeft, el.scrollTop]).toEqual([l0 + 40, t0 + 20]);
  document.dispatchEvent(new PointerEvent("pointerup", { clientX: 60, clientY: 80, pointerId: 1 }));
  expect(graph.selected()).toBeNull();
  expect(graph.toJSON().nodes[0]).toMatchObject({ x: 40, y: 40 });
  expect(el.classList.contains("mz-panning")).toBe(false);
  // 離したあとは動かさない
  document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0, pointerId: 1 }));
  expect([el.scrollLeft, el.scrollTop]).toEqual([l0 + 40, t0 + 20]);
});

test("プレビュー中: 箱を押すと選ぶだけ。Undo / Redo は効かない", () => {
  const { el, graph } = setup();
  graph.update(1, { caption: "直した" });
  graph.setPreview(1);
  fireOn(head(el, 2), "pointerdown", 400, 40);
  fireOn(head(el, 2), "pointermove", 500, 200);
  fireOn(head(el, 2), "pointerup", 500, 200);
  expect(graph.selected()).toBe("2");
  expect(graph.toJSON().nodes[1]).toMatchObject({ x: 400, y: 40 });
  expect(graph.undo()).toBe(false);
  expect(graph.toJSON().nodes[0]!.caption).toBe("直した");
  graph.setPreview(null);
  expect(graph.undo()).toBe(true);
});
