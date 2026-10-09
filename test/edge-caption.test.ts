// 線のキャプション（docs/EDGE-CAPTION-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import { summarize } from "../web/src/report";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div"), side = document.createElement("aside");
  document.body.append(side, el);
  let panel: Panel | null = null;
  const graph = createGraph(el, data, { measureText: fakeMeasure, onSelect: i => panel?.show(i) });
  graphs.push(graph);
  panel = createPanel(side, graph);
  return { el, side, graph };
}

// 箱は 120×64。1 と 2 は横に並び、線は 160 から 400 までの 240
const two = (x2: number, caption?: string): Diagram => ({
  world: { width: 1000 },
  nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: x2, y: 40 }],
  edges: [{ id: "e1", from: 1, to: 2, ...(caption ? { caption } : {}) }],
});
const label = (el: HTMLElement) => el.querySelector<SVGForeignObjectElement>(".mz-edge .mz-label");

test("キャプションを線の真ん中に置き、データに残す", () => {
  const { el, graph } = setup(two(400, "申請"));
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2, caption: "申請" }]);
  const fo = label(el)!;
  expect(fo.textContent).toBe("申請");
  // 真ん中は x=280。幅は上限の 160（線の長さ 240 - 16 = 224 より狭い）
  expect([Number(fo.getAttribute("x")) + Number(fo.getAttribute("width")) / 2, Number(fo.getAttribute("width"))]).toEqual([280, 160]);
});

test("箱どうしが近いと、線の長さに合わせて狭く折り返す（下限は 48）", () => {
  const { el } = setup(two(240, "申請")); // 線は 160 から 240 までの 80 → 80 - 16 = 64
  expect(Number(label(el)!.getAttribute("width"))).toBe(64);
  const near = setup(two(180, "申請"));   // 線は 20 → 下限の 48
  expect(Number(label(near.el)!.getAttribute("width"))).toBe(48);
});

test("キャプションが無ければ札を出さない", () => {
  const { el } = setup(two(400));
  expect(label(el)).toBeNull();
});

test("サイドバーで書き換えられ、空にすると消える。札を押すと線を選ぶ", () => {
  const { el, side, graph } = setup(two(400));
  graph.selectEdge("e1");
  const input = side.querySelector<HTMLInputElement>('[data-edit="edge-caption"]')!;
  input.value = "承認";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2, caption: "承認" }]);
  expect(label(el)!.textContent).toBe("承認");
  graph.select(1);
  label(el)!.querySelector("span")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(el.querySelector(".mz-edge")!.classList.contains("mz-selected")).toBe(true);
  graph.updateEdge("e1", { caption: "" });
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
  expect(label(el)).toBeNull();
  graph.undo();
  expect(label(el)!.textContent).toBe("承認");
});

test("check の要約に、箱と重なっている線のキャプションを出す", () => {
  const text = summarize({
    viewport: { w: 1000, h: 700 },
    boxes: [{ id: "3", caption: "邪魔", ancestors: [], x: 260, y: 60, w: 120, h: 64, cut: false, color: "#fff" }],
    edges: [{ id: "e1", a: "1", b: "2", points: [[160, 72], [400, 72]], caption: "申請", label: { x: 260, y: 64, w: 40, h: 16 } }],
  });
  expect(text).toContain("label 1: e1(1-2) 申請>#3 邪魔");
});

test("真ん中が縦向きの線と、自分に戻る線は、線の長さで狭めず上限の幅で折り返す", () => {
  const { el } = setup({
    world: { width: 1000 },
    nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 40, y: 140 }, { id: 3, x: 400, y: 40 }],
    edges: [{ id: "e1", from: 1, to: 2, caption: "縦" }, { id: "e2", from: 3, to: 3, caption: "輪" }],
  });
  const widths = [...el.querySelectorAll<SVGForeignObjectElement>(".mz-edge .mz-label")].map(f => Number(f.getAttribute("width")));
  expect(widths.sort()).toEqual([160, 160]);
});

// ---- キャプションの位置（captionAt は線の長さに対する割合、captionOffset は線から離す px。進む向きの左が正） ----

const center = (fo: SVGForeignObjectElement) =>
  [Number(fo.getAttribute("x")) + Number(fo.getAttribute("width")) / 2, Number(fo.getAttribute("y")) + Number(fo.getAttribute("height")) / 2];

test("captionAt と captionOffset の位置に置く（右向きの線なら左は上）", () => {
  const d = two(400, "申請");
  Object.assign(d.edges![0] as object, { captionAt: 0.25, captionOffset: 20 });
  const { el } = setup(d);
  // 線は (160,72) から (400,72)。4 分の 1 は x=220、上へ 20
  expect(center(label(el)!)).toEqual([220, 52]);
});

test("札をつまんで動かすと、線に沿った位置と線からの距離が変わる。離す量は ±60 まで。Undo で戻る", () => {
  const { el, graph } = setup(two(400, "申請"));
  const span = label(el)!.querySelector("span")!;
  const world = el.querySelector(".mz-world")!;
  const fire = (t: Element, type: string, x: number, y: number) =>
    t.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire(span, "pointerdown", 280, 72);
  fire(world, "pointermove", 300, 60);
  fire(world, "pointermove", 340, 50); // x=340 は (340-160)/240 = 0.75、上へ 22
  fire(world, "pointerup", 340, 50);
  const e = () => graph.toJSON().edges![0] as { captionAt?: number; captionOffset?: number };
  expect([e().captionAt, e().captionOffset]).toEqual([0.75, 22]);
  expect(center(label(el)!)).toEqual([340, 50]);
  fire(span, "pointerdown", 340, 50);
  fire(world, "pointermove", 340, -100); // 離しすぎは 60 で止める
  fire(world, "pointerup", 340, -100);
  expect(e().captionOffset).toBe(60);
  graph.undo();
  expect(e().captionOffset).toBe(22);
});

test("サイドバーの「キャプションの位置を自動に戻す」で真ん中に戻る", () => {
  const d = two(400, "申請");
  Object.assign(d.edges![0] as object, { captionAt: 0.25, captionOffset: 20 });
  const { el, side, graph } = setup(d);
  graph.selectEdge("e1");
  side.querySelector<HTMLElement>("[data-caption-reset]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2, caption: "申請" }]);
  expect(center(label(el)!)).toEqual([280, 72]);
});
