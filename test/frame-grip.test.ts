// 枠のつまみ（D45。docs/BOX-SIZE-plan.md の 6.3）: 内包のページで、子の無い箱と内包する箱の大きさを自由に決めて固定にする。
// 動かした向きだけ固定、ダブルクリックでその向きを中身に合わせるに戻す、下限は土台の最小（64×44）、内包する箱は子が入る大きさまで、上限は紙
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, type Graph, createGraph } from "../web/src/graph";
import { mountDiagram } from "../web/src/view";
import { PAPERS } from "../web/src/validate";
import { BASE_MIN } from "../web/src/size-rules";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => { graph?.destroy(); graph = null; document.body.innerHTML = ""; });

const events: { kind: string }[] = [];
function setup(data: Diagram, paper = false) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  events.length = 0;
  graph = createGraph(el, data, { measureText: fakeMeasure, paper, onEvent: ev => events.push(ev) });
  return graph;
}
const info = (id: number) => graph!.info(id) as BoxInfo;
const node = (id: number) => graph!.toJSON().nodes.find(n => n.id === id)!;
const frame = (id: number) => document.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head > .mz-frame`)!;
const grip = (id: number, axis: "x" | "y" | "xy") => frame(id).querySelector<HTMLElement>(`[data-axis="${axis}"]`)!;
// つまみを (dx, dy) だけドラッグして離す（steps 回に分けて動かす）
function drag(id: number, axis: "x" | "y" | "xy", dx: number, dy: number, steps = 1) {
  graph!.select(id);
  const g = grip(id, axis);
  const fire = (type: string, x: number, y: number) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire("pointerdown", 0, 0);
  for (let i = 1; i <= steps; i++) fire("pointermove", dx * i / steps, dy * i / steps);
  fire("pointerup", dx, dy);
}

test("内包のページでは、子の無い箱と内包する箱に枠のつまみが出る。リストとリストの子、リンクの箱には出ない", () => {
  setup({
    pages: [{ id: "p2", title: "別" }],
    nodes: [
      { id: 1, caption: "箱", x: 40, y: 40 },
      { id: 2, caption: "枠", x: 300, y: 40 },
      { id: 3, parent: 2, caption: "子" },
      { id: 4, caption: "リスト", childView: "list", x: 40, y: 300 },
      { id: 5, parent: 4, caption: "行" },
      { id: 6, caption: "窓", link: "p2", x: 600, y: 300 },
      { id: 7, caption: "分岐", shape: "diamond", x: 600, y: 40 },
    ],
  });
  expect([1, 2, 3, 4, 5, 6].map(id => frame(id).hidden)).toEqual([false, false, false, true, true, true]);
  // ひし形は高さを形と文字から決めるので、幅だけ
  expect(["x", "y", "xy"].map(a => grip(7, a as "x").hidden)).toEqual([false, true, true]);
});

test("ツリーとフローチャートのページには出さない（内包のページだけ）", () => {
  setup({ world: { childView: "tree", root: 1 }, nodes: [{ id: 1, caption: "根", x: 40, y: 40 }, { id: 2, parent: 1, caption: "子" }, { id: 3, caption: "葉", x: 400, y: 40 }] });
  expect([1, 2, 3].map(id => frame(id).hidden)).toEqual([true, true, true]);
  graph!.destroy();
  setup({ world: { childView: "flow" }, nodes: [{ id: 1, caption: "開始", x: 40, y: 40 }] });
  expect(frame(1).hidden).toBe(true);
});

test("右の辺をつまむと幅だけが固定になり、高さは中身に合わせたまま。手を離すと 1 件の履歴で、Undo で戻る", () => {
  setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }, { id: 2, caption: "右", x: 168, y: 40 }] });
  const w0 = info(1).w, x2 = info(2).x;
  expect(graph!.history().canUndo).toBe(false);
  drag(1, "x", 80, 30);
  expect(info(1).w).toBe(w0 + 80);
  expect(info(2).x).toBe(info(1).x + info(1).w + DEFAULTS.gap); // 右の箱を押しのける
  expect([node(1).fixedWidth, node(1).fixedHeight, node(1).width]).toEqual([true, undefined, w0 + 80]);
  graph!.undo();
  expect([info(1).w, info(2).x, node(1).fixedWidth]).toEqual([w0, x2, undefined]);
});

test("下の辺は高さだけ、右下の角は両方を固定にする", () => {
  setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] });
  const { w, h } = info(1);
  drag(1, "y", 40, 50);
  expect([info(1).w, info(1).h, node(1).fixedWidth, node(1).fixedHeight]).toEqual([w, h + 50, undefined, true]);
  drag(1, "xy", 30, -20);
  expect([info(1).w, info(1).h, node(1).fixedWidth, node(1).fixedHeight]).toEqual([w + 30, h + 30, true, true]);
});

test("縮められるのは土台の最小 64×44 まで（入らない文字は … で切る）", () => {
  setup({ nodes: [{ id: 1, caption: "とても長いキャプションの箱", x: 40, y: 40 }] });
  drag(1, "xy", -900, -900);
  expect([info(1).w, info(1).h]).toEqual([BASE_MIN.w, BASE_MIN.h]);
  expect([node(1).width, node(1).height]).toEqual([BASE_MIN.w, BASE_MIN.h]);
});

test("つまみのダブルクリックで、その向きの固定を外して中身に合わせる（角なら両方）", () => {
  const stage = document.createElement("div"), side = document.createElement("div");
  document.body.append(stage, side);
  graph = mountDiagram(stage, side, { nodes: [{ id: 1, caption: "箱", width: 200, height: 120, fixedWidth: true, fixedHeight: true, x: 40, y: 40 }] }, { measureText: fakeMeasure }).graph;
  const auto = { w: 120, h: 64 }; // 中身に合わせた大きさ（M の最小）
  expect([info(1).w, info(1).h]).toEqual([200, 120]);
  graph.select(1);
  const dbl = (axis: string) => grip(1, axis as "x").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  dbl("x");
  expect([info(1).w, info(1).h, node(1).fixedWidth, node(1).fixedHeight]).toEqual([auto.w, 120, undefined, true]);
  graph.update(1, { width: 200 });
  dbl("xy");
  expect([info(1).w, info(1).h, node(1).fixedWidth, node(1).fixedHeight]).toEqual([auto.w, auto.h, undefined, undefined]);
  expect(document.querySelector(".mz-dlg-overlay")).toBeNull(); // 編集ダイアログは開かない
});

test("内包する箱も固定にできる。子が入る大きさより小さくはならず、固定のあいだは子が縮んでも箱は縮まない", () => {
  setup({ nodes: [{ id: 1, caption: "枠", x: 40, y: 40 }, { id: 2, parent: 1, caption: "子", x: 12, y: 30 }] });
  const g0 = { w: info(1).w, h: info(1).h };
  drag(1, "xy", -100, -100); // 子の範囲より小さくしようとする
  expect([info(1).w, info(1).h]).toEqual([g0.w, g0.h]);
  drag(1, "xy", 100, 60);
  expect([info(1).w, info(1).h, node(1).fixedWidth, node(1).fixedHeight]).toEqual([g0.w + 100, g0.h + 60, true, true]);
  graph!.update(2, { caption: "子" }); // 変わらない変更で並べ直しても、固定の大きさのまま
  expect([info(1).w, info(1).h]).toEqual([g0.w + 100, g0.h + 60]);
});

test("固定にした内包する箱の中で子をドラッグして壁を押しても、箱は広がらない（壁で止まる）", () => {
  setup({ nodes: [{ id: 1, caption: "枠", width: 300, height: 200, fixedWidth: true, fixedHeight: true, x: 40, y: 40 }, { id: 2, parent: 1, caption: "子", x: 12, y: 30 }] });
  const head = document.querySelector<HTMLElement>('.mz-node[data-id="2"] > .mz-head')!;
  const fire = (type: string, x: number, y: number) => head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire("pointerdown", 0, 0);
  fire("pointermove", 500, 500);
  fire("pointerup", 500, 500);
  expect([info(1).w, info(1).h]).toEqual([300, 200]);
  expect(info(2).x + info(2).w).toBeLessThanOrEqual(300 - DEFAULTS.padding);
  expect(info(2).y + info(2).h).toBeLessThanOrEqual(200 - DEFAULTS.padding);
});

test("紙に収まらない大きさにはしない（収まった最後の大きさで止まる）", () => {
  const A4 = PAPERS["a4-landscape"];
  setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }, true);
  drag(1, "x", 5000, 0, 100);
  expect(info(1).x + info(1).w).toBeLessThanOrEqual(A4.w - DEFAULTS.padding);
  expect(info(1).w).toBeGreaterThan(400); // 段の上限（L 400）を超えて広げられる
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(0);
});
