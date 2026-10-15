// 紙（D33。docs/PAPER-plan.md）: 紙の制限を受けるパターンのページは、紙の型（world.paper。無ければ A4 横）の大きさに固定する。
// マスターは受けない。LLM への要約のはみ出しは紙に対して数え、開いたときに箱を表示領域へ寄せる調整（fitToViewport）はしない
import { afterEach, expect, test } from "bun:test";
import { type Graph, createGraph } from "../web/src/graph";
import { summarize } from "../web/src/report";
import { DEFAULT_PAPER, PAPERS, problems } from "../web/src/validate";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => { graph?.destroy(); graph = null; document.body.innerHTML = ""; });

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, data, { measureText: fakeMeasure, paper: true });
  const world = el.querySelector<HTMLElement>(".mz-world")!;
  return { graph, world };
}
const sizeOf = (world: HTMLElement) => [Number.parseFloat(world.style.width), Number.parseFloat(world.style.height)];

test("紙の型が無ければ既定（A4 横）の大きさ。world.paper があればその型の大きさ。紙の見た目の印が付く", () => {
  const a = setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] });
  expect(a.graph.paper()).toEqual({ name: DEFAULT_PAPER, w: PAPERS["a4-landscape"].w, h: PAPERS["a4-landscape"].h });
  expect(sizeOf(a.world)).toEqual([PAPERS["a4-landscape"].w, PAPERS["a4-landscape"].h]);
  expect(a.world.classList.contains("mz-paper")).toBe(true);
  graph!.destroy();
  const b = setup({ world: { paper: "a3-portrait" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] });
  expect(sizeOf(b.world)).toEqual([PAPERS["a3-portrait"].w, PAPERS["a3-portrait"].h]);
});

test("マスターのページは紙の制限を受けない（表示領域と中身に合わせて伸びる）", () => {
  const { graph, world } = setup({ world: { childView: "master" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] } as Diagram);
  expect(graph.paper()).toBeNull();
  expect(sizeOf(world)).toEqual([1000, 700]); // 表示領域（test/setup.ts）
  expect(world.classList.contains("mz-paper")).toBe(false);
});

test("知らない紙の型は誤り", () => {
  expect(problems({ world: { paper: "b5" }, nodes: [] }).join("\n")).toContain("paper");
  expect(problems({ world: { paper: "a4-portrait" }, nodes: [] })).toEqual([]);
});

test("要約のはみ出しは紙に対して数え、開いたときに紙の外の箱を中へ寄せない", () => {
  const w = PAPERS["a4-landscape"].w;
  const { graph } = setup({ nodes: [{ id: 1, caption: "中", x: 40, y: 40 }, { id: 2, caption: "外", x: w + 100, y: 40 }] });
  expect(graph.info(2).x).toBe(w + 100); // 寄せない
  const s = summarize(graph.geometry());
  expect(s.split("\n")[0]).toMatch(new RegExp(`^paper a4-landscape ${w}x${PAPERS["a4-landscape"].h}, content \\d+x\\d+ → over right \\d+`));
});
