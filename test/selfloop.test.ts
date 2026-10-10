// 自分に戻る線（docs/SELFLOOP-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import { selfLoop } from "../web/src/selfloop";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

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

const box = { x: 100, y: 100, w: 120, h: 64 };

test("既定は右上: 上の辺から出て右の辺に戻り、箱の外を回る", () => {
  const { points, corner } = selfLoop(box, [], 0);
  expect(corner).toBe("topRight");
  const [s, t] = [points[0]!, points.at(-1)!];
  expect(s[1]).toBe(100);           // 上の辺
  expect(s[0]).toBeLessThan(220);
  expect(t[0]).toBe(220);           // 右の辺
  expect(t[1]).toBeGreaterThan(100);
  // 途中の点は箱の外（右上の角の外側）
  for (const [x, y] of points.slice(1, -1)) expect(x > 220 || y < 100).toBe(true);
});

test("右上がほかの箱でふさがっていれば、空いている角を選ぶ", () => {
  const blocker = { x: 200, y: 20, w: 120, h: 70 }; // 右上を覆う
  expect(selfLoop(box, [blocker], 0).corner).toBe("topLeft");
});

test("同じ角の 2 本目は、輪を大きくする", () => {
  const span = (pts: [number, number][]) => Math.max(...pts.map(p => p[0])) - 220;
  expect(span(selfLoop(box, [], 1).points)).toBeGreaterThan(span(selfLoop(box, [], 0).points));
});

test("自分に戻る線を読み込めて、描く。矢印は終点に付く", () => {
  const { el, graph } = setup({ nodes: [{ id: 1, caption: "申請中", x: 100, y: 100 }], edges: [{ id: "e1", from: 1, to: 1, arrow: "end" }] });
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 1, arrow: "end" }]);
  const line = el.querySelector<SVGPolylineElement>(".mz-edge .mz-line")!;
  expect(line.getAttribute("points")!.split(" ").length).toBeGreaterThan(8);
  expect(el.querySelector(".mz-edge path")!.getAttribute("d")).not.toBe("");
});

test("同じ箱から同じ箱へ線を引くと、自分に戻る線になる", () => {
  const { graph } = setup({ nodes: [{ id: 1, x: 100, y: 100 }] });
  expect(graph.link(1, 1)).toBe(true);
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 1, arrow: "end" }]);
});

test("サイドバー: 自分に戻る線では、通り方と向きの指定を出さない", () => {
  const stage = document.createElement("div"), side = document.createElement("aside");
  document.body.append(side, stage);
  let panel: Panel | null = null;
  const graph = createGraph(stage, { world: { route: "elbow" }, nodes: [{ id: 1, x: 100, y: 100 }], edges: [{ id: "e1", from: 1, to: 1 }] },
    { measureText: fakeMeasure, onSelect: i => panel?.show(i) });
  graphs.push(graph);
  panel = createPanel(side, graph);
  graph.selectEdge("e1");
  expect(side.querySelector('input[name="mzp-route"]')).toBeNull();
  expect(side.querySelector('input[name="mzp-exit"]')).toBeNull();
  expect(side.querySelector('input[data-arrow="end"]')).not.toBeNull();
});

// ---- 端の位置（exitAt / enterAt は箱のふちを左上から時計回りに一周した割合） ----
// box は 120×64 なので一周 368。上の辺は 0〜120/368、右の辺は 120/368〜184/368、下は〜304/368、左は〜1

test("端の位置を指定すると、その 2 点を通る輪を、箱の外に描く", () => {
  const exit = 60 / 368, enter = 150 / 368; // 上の辺の真ん中、右の辺の上から 30
  const { points } = selfLoop(box, [], 0, [], { exit, enter });
  expect(points[0]).toEqual([160, 100]);
  expect(points.at(-1)!.map(v => Math.round(v))).toEqual([220, 130]);
  for (const [x, y] of points.slice(1, -1)) expect(x > 220 || y < 100).toBe(true);
});

test("同じ辺に両端があっても、箱の外に描く", () => {
  const { points } = selfLoop(box, [], 0, [], { exit: 30 / 368, enter: 90 / 368 });
  for (const [, y] of points.slice(1, -1)) expect(y).toBeLessThan(100.5);
});

test("向かいの辺に両端がある指定は使わず、自動の角に描く", () => {
  const auto = selfLoop(box, [], 0).points;
  expect(selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 240 / 368 }).points).toEqual(auto); // 上と下
});

test("端が動ける範囲は、もう一方の端の辺とその両隣の辺だけ", () => {
  const { ends } = selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 150 / 368 });
  // 始点が動けるのは、終点（右の辺）とその両隣（上と下）: 左上 → 右上 → 右下 → 左下
  expect(ends.exit).toEqual([[100, 100], [220, 100], [220, 164], [100, 164]]);
  // 終点が動けるのは、始点（上の辺）とその両隣（左と右）: 左下 → 左上 → 右上 → 右下
  expect(ends.enter).toEqual([[100, 164], [100, 100], [220, 100], [220, 164]]);
});

test("選択モードで端をつまんで動かすと exitAt が変わり、箱のふちを一周した割合で保存する", () => {
  const { el, graph } = setup({ nodes: [{ id: 1, x: 100, y: 100 }], edges: [{ id: "e1", from: 1, to: 1 }] });
  graph.selectEdge("e1");
  const end = el.querySelector<SVGCircleElement>(".mz-end")!;
  const world = el.querySelector(".mz-world")!;
  const fire = (target: Element, type: string, x: number, y: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire(end, "pointerdown", Number(end.getAttribute("cx")), Number(end.getAttribute("cy")));
  fire(world, "pointermove", 130, 90); // 上の辺の左寄り（x=130）へ
  fire(world, "pointerup", 130, 90);
  const at = (graph.toJSON().edges![0] as { exitAt?: number }).exitAt!;
  expect(Math.round(at * 368)).toBe(30);
});

test("ほかの線が輪の範囲を横切るなら（折れ点が範囲の外でも）、その角は使わない", () => {
  // 箱の上の辺のすぐ上を、横にまっすぐ通る線。折れ点（両端）は輪の範囲のずっと外
  const line: [number, number][] = [[0, 85], [400, 85]];
  const { corner } = selfLoop(box, [], 0, [line]);
  expect(corner).toBe("bottomRight");
});
