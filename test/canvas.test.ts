// 図の周りの余白と、倍率（D32。docs は残課題図の D32）。ワールドは余白の分だけずらして置き、
// スクロールできる広さは見えない入れ物（.mz-canvas）が「ワールド × 倍率 ＋ 周りの余白」で決める
import { afterEach, expect, test } from "bun:test";
import { type Graph, createGraph } from "../web/src/graph";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => { graph?.destroy(); graph = null; document.body.innerHTML = ""; });

function setup(margin: number) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }, { measureText: fakeMeasure, margin });
  const world = el.querySelector<HTMLElement>(".mz-world")!;
  const canvas = el.querySelector<HTMLElement>(".mz-canvas")!;
  return { el, graph, world, canvas };
}

test("ワールドは周りの余白の分だけずらして置き、ワールドに使える広さは表示領域から両側の余白を除いた広さ", () => {
  const m = 50;
  const { graph, world, canvas } = setup(m);
  expect([world.style.left, world.style.top]).toEqual([`${m}px`, `${m}px`]);
  expect(graph.view()).toEqual({ zoom: 1, margin: m });
  // 表示領域は 1000 × 700（test/setup.ts）
  expect(graph.geometry().viewport).toEqual({ w: 1000 - 2 * m, h: 700 - 2 * m });
  expect(world.style.width).toBe(`${1000 - 2 * m}px`);
  expect([canvas.style.width, canvas.style.height]).toEqual([`${1000}px`, `${700}px`]);
});

test("倍率をかけると、ワールドは transform で拡大縮小し、スクロールできる広さは見た目の大きさ ＋ 余白になる。要約の広さは 100% のまま", () => {
  const m = 50;
  const { graph, world, canvas } = setup(m);
  graph.setPreview(2);
  expect(world.style.transform).toBe("scale(2)");
  const w = Number.parseFloat(world.style.width), h = Number.parseFloat(world.style.height);
  expect(canvas.style.width).toBe(`${Math.ceil(w * 2 + 2 * m)}px`);
  expect(canvas.style.height).toBe(`${Math.ceil(h * 2 + 2 * m)}px`);
  expect(graph.geometry().viewport).toEqual({ w: 1000 - 2 * m, h: 700 - 2 * m }); // LLM への要約は 100% の広さ
  graph.setPreview(null);
  expect(world.style.transform).toBe("");
});
