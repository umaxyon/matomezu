// プレビュー（見るだけのモード。preview.ts。残課題 D5）の倍率のボタン
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { setupPreview, STEP } from "../web/src/preview";
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
