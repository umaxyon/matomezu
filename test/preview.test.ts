// プレビュー（見るだけのモード。preview.ts。残課題 D5）の倍率のボタン
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGraph, type Graph } from "../web/src/graph";
import { EDIT_ZOOMS, setupPreview, STEP } from "../web/src/preview";
import { PAPERS, DEFAULT_PAPER } from "../web/src/validate";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
const realMatchMedia = globalThis.matchMedia;
afterEach(() => {
  graph?.destroy();
  graph = null;
  globalThis.matchMedia = realMatchMedia;
  document.body.className = "";
  document.body.innerHTML = "";
});

test("＋で拡大し、「全体」で収まる倍率に戻る", () => {
  // なめらかに変える動き（アニメーション）を止め、行き先の倍率をすぐかける（動きを減らす設定のとき。preview.ts の zoomTo）
  globalThis.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q })) as unknown as typeof matchMedia;
  const stage = document.createElement("div");
  document.body.appendChild(stage);
  graph = createGraph(stage, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }, { measureText: fakeMeasure });
  const btn = () => document.body.appendChild(document.createElement("button"));
  const ui = { toggle: btn(), zoomOut: btn(), zoomIn: btn(), fit: btn(), home: btn(), level: document.createElement("span") };
  setupPreview(ui).attach(graph, stage);
  ui.toggle.click();
  // 入ると紙（既定の A4 横）の全体が表示領域（1000 × 700。test/setup.ts）に収まる倍率
  const paper = PAPERS[DEFAULT_PAPER];
  const fit = graph.preview()!;
  expect(fit).toBeCloseTo(Math.min(stage.clientWidth / paper.w, stage.clientHeight / paper.h, 1), 5);
  expect(ui.level.textContent).toBe(`${Math.round(fit * 100)}%`);
  ui.zoomIn.click();
  expect(graph.preview()!).toBeCloseTo(fit * STEP, 5); // ボタン 1 回で STEP 倍（preview.ts）
  ui.fit.click();
  expect(graph.preview()!).toBeCloseTo(fit, 5);
  expect(ui.level.textContent).toBe(`${Math.round(fit * 100)}%`);
});

test("編集中は ＋／－ で EDIT_ZOOMS の段を 1 つずつ動き、端の段ではボタンを押せない。「全体」はプレビューだけ。プレビューを抜けると編集中の倍率に戻る", () => {
  globalThis.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q })) as unknown as typeof matchMedia;
  const stage = document.createElement("div");
  document.body.appendChild(stage);
  graph = createGraph(stage, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }, { measureText: fakeMeasure });
  const btn = () => document.body.appendChild(document.createElement("button"));
  const ui = { toggle: btn(), zoomOut: btn(), zoomIn: btn(), fit: btn(), home: btn(), level: document.createElement("span") };
  setupPreview(ui).attach(graph, stage);
  const state = () => ({ zoom: graph!.zoom(), level: ui.level.textContent, canIn: !ui.zoomIn.disabled, canOut: !ui.zoomOut.disabled });
  const at = (z: number) => ({ zoom: z, level: `${Math.round(z * 100)}%`, canIn: z < EDIT_ZOOMS.at(-1)!, canOut: z > EDIT_ZOOMS[0]! });
  const start = EDIT_ZOOMS.indexOf(1);
  expect(state()).toEqual(at(1));
  for (let i = start + 1; i < EDIT_ZOOMS.length; i++) { ui.zoomIn.click(); expect(state()).toEqual(at(EDIT_ZOOMS[i]!)); }
  expect(ui.zoomIn.disabled).toBe(true);
  ui.zoomIn.click(); // 端の段から先へは行かない
  expect(state()).toEqual(at(EDIT_ZOOMS.at(-1)!));
  for (let i = EDIT_ZOOMS.length - 2; i >= 0; i--) { ui.zoomOut.click(); expect(state()).toEqual(at(EDIT_ZOOMS[i]!)); }
  expect(ui.zoomOut.disabled).toBe(true);
  ui.zoomOut.click();
  expect(state()).toEqual(at(EDIT_ZOOMS[0]!));
  expect(graph.view().zoom).toBe(EDIT_ZOOMS[0]!);
  // 「全体」は body.previewing のときだけ見せる（index.html の CSS）
  const html = readFileSync(join(import.meta.dir, "../web/index.html"), "utf8");
  expect(html).toMatch(/body:not\(\.previewing\) #zoom-fit \{ display: none; \}/);
  expect(document.body.classList.contains("previewing")).toBe(false);
  ui.toggle.click();
  expect(document.body.classList.contains("previewing")).toBe(true);
  expect(graph.preview()).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(document.body.classList.contains("previewing")).toBe(false);
  expect(graph.preview()).toBeNull();
  expect(state()).toEqual(at(EDIT_ZOOMS[0]!));
  expect(graph.view().zoom).toBe(EDIT_ZOOMS[0]!);
});
