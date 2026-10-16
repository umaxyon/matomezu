// 自分に戻る線（docs/SELFLOOP-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { openEdgeEditDialog } from "../web/src/edit-dialog";
import { type Corner, cornerAt, nearestCorner, selfLoop } from "../web/src/selfloop";
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

test("自分に戻る線では、線の編集ダイアログに通り方も端の位置の操作も出さない", () => {
  const stage = document.createElement("div");
  document.body.append(stage);
  const graph = createGraph(stage, { world: { route: "elbow" }, nodes: [{ id: 1, x: 100, y: 100 }], edges: [{ id: "e1", from: 1, to: 1 }] },
    { measureText: fakeMeasure });
  graphs.push(graph);
  openEdgeEditDialog(graph, "e1");
  const dlg = document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  expect(dlg.querySelector('input[name="route"]')).toBeNull();
  expect(dlg.querySelector('[data-once="align"]')).toBeNull();
  expect(dlg.querySelector('select[name="head-end"]')).not.toBeNull();
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

// ---- 辺の境目・角の選び方・角の端の位置（純粋な関数） ----
// 辺は box のふち一周 368 の上で: 上 [0, 120)、右 [120, 184)、下 [184, 304)、左 [304, 368)。角の点は、そこから時計回りに進む辺に入る

// 途中の点が、箱の内側（縁から 0.5 より内）に入っていない
const outsideBox = (pts: [number, number][]) => pts.slice(1, -1).every(([x, y]) =>
  x <= box.x + 0.5 || x >= box.x + box.w - 0.5 || y <= box.y + 0.5 || y >= box.y + box.h - 0.5);

test("角の点は時計回りに進む辺に入る: 左下の角（304）は左の辺なので、上の辺と組めば使う。その手前（303）は下の辺なので使わない", () => {
  const auto = selfLoop(box, [], 0).points;
  const leftCorner = selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 304 / 368 }).points;
  expect(leftCorner).not.toEqual(auto);
  expect(leftCorner.at(-1)!.map(v => Math.round(v))).toEqual([100, 164]);
  expect(selfLoop(box, [], 0, [], { exit: 60 / 368, enter: 303 / 368 }).points).toEqual(auto);
  // 右上の角（120）は右の辺なので、下の辺と組めば使う
  const rightCorner = selfLoop(box, [], 0, [], { exit: 120 / 368, enter: 240 / 368 }).points;
  expect(rightCorner[0]!.map(v => Math.round(v))).toEqual([220, 100]);
  // 割合が小数の誤差なしに表せる正方形（一周 256、角は 0・0.25・0.5・0.75）で、境目そのものを確かめる
  const sq = { x: 0, y: 0, w: 64, h: 64 };
  const sqAuto = selfLoop(sq, [], 0).points;
  expect(selfLoop(sq, [], 0, [], { exit: 0.125, enter: 0.75 }).points).not.toEqual(sqAuto); // 左下の角は左の辺（上と隣）
  expect(selfLoop(sq, [], 0, [], { exit: 0.125, enter: 0.5 }).points).toEqual(sqAuto);      // 右下の角は下の辺（上と向かい）なので使わない
});

test("隣り合う辺・同じ辺のどの組でも（向きを入れ替えても）、輪は箱の中に入らない", () => {
  const mid = { t: 60, r: 152, b: 244, l: 336 }; // 各辺の真ん中（一周 368 の上）
  const pairs: [keyof typeof mid, keyof typeof mid][] = [["t", "r"], ["r", "b"], ["b", "l"], ["l", "t"], ["t", "t"], ["r", "r"]];
  for (const [p, q] of pairs) {
    const [e, n] = [mid[p], mid[q] + (p === q ? 20 : 0)];
    for (const [s, t] of [[e, n], [n, e]]) {
      const { points } = selfLoop(box, [], 0, [], { exit: s! / 368, enter: t! / 368 });
      expect([p, q, outsideBox(points)]).toEqual([p, q, true]);
    }
  }
});

test("4 つの角のどれを選んでも、端は箱のふちの上にあり、輪は箱の外を回る。ふさがった角を順に飛ばす（右上 → 左上 → 右下 → 左下）", () => {
  const tr = { x: 210, y: 60, w: 60, h: 50 }, tl = { x: 50, y: 60, w: 60, h: 50 };
  const br = { x: 210, y: 154, w: 60, h: 50 };
  const cases: [typeof box[], Corner][] = [[[], "topRight"], [[tr], "topLeft"], [[tr, tl], "bottomRight"], [[tr, tl, br], "bottomLeft"]];
  for (const [blockers, want] of cases) {
    const { points, corner } = selfLoop(box, blockers, 0);
    expect(corner).toBe(want);
    expect(outsideBox(points)).toBe(true);
    for (const p of [points[0]!, points.at(-1)!]) {
      const onEdge = p[0] === box.x || p[0] === box.x + box.w || p[1] === box.y || p[1] === box.y + box.h;
      expect(onEdge).toBe(true);
    }
  }
});

test("4 つの角がどれもふさがっていれば、既定の右上に描く", () => {
  const all = [{ x: 0, y: 0, w: 400, h: 90 }, { x: 0, y: 174, w: 400, h: 90 }];
  expect(selfLoop(box, all, 0).corner).toBe("topRight");
});

test("小さい箱でも、角の端は辺の上（辺の長さの半分まで）に収める", () => {
  const small = { x: 0, y: 0, w: 20, h: 10 };
  const { points } = selfLoop(small, [], 0);
  expect(points[0]).toEqual([15, 0]);     // 上の辺。角から高さの半分（5）
  expect(points.at(-1)).toEqual([20, 5]); // 右の辺
});

test("nearestCorner: 点が真ん中より右なら右、上半分なら上（真ん中の点は右下）", () => {
  expect(nearestCorner(box, [105, 105])).toBe("topLeft");
  expect(nearestCorner(box, [215, 105])).toBe("topRight");
  expect(nearestCorner(box, [105, 160])).toBe("bottomLeft");
  expect(nearestCorner(box, [160, 132])).toBe("bottomRight");
});

test("cornerAt: 角に描くときの端の位置（一周の割合）。その角がふさがっていれば null。返した位置で描けば箱の外を回る", () => {
  expect(cornerAt(box, [], 0, [], "topRight")).toEqual({ exit: (120 - 16) / 368, enter: (120 + 16) / 368 });
  expect(cornerAt(box, [{ x: 200, y: 20, w: 120, h: 70 }], 0, [], "topRight")).toBeNull();
  for (const c of ["topRight", "topLeft", "bottomRight", "bottomLeft"] as const) {
    const at = cornerAt(box, [], 1, [], c)!;
    expect(outsideBox(selfLoop(box, [], 1, [], at).points)).toBe(true);
  }
});
