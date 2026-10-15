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

const events: { kind: string }[] = [];
function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  events.length = 0;
  graph = createGraph(el, data, { measureText: fakeMeasure, paper: true, onEvent: ev => events.push(ev) });
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

test("操作で箱が紙からはみ出すなら、しなかったことにする。ダイアログの確定（batch）は false を返し、ほかの操作は知らせる", () => {
  const h = PAPERS["a5-landscape"].h;
  const { graph } = setup({ world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "下の箱", x: 40, y: h - 120 }] });
  const before = graph.toJSON();
  // 紙の高さより高くなる本文（どこへ動かしても収まらない。収まる所があれば、並べ方が紙の中の空きへ動かして収める）
  const long = "続き\n".repeat(60);
  // ダイアログの確定と同じ入口: しなかったことにして false。知らせはダイアログが出すので、ここでは出さない
  expect(graph.batch(() => graph.update(1, { body: long }))).toBe(false);
  expect(graph.toJSON()).toEqual(before);
  expect(graph.history().canUndo).toBe(false);
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(0);
  // ダイアログ以外の操作: しなかったことにして知らせる
  graph.update(1, { body: long });
  expect(graph.toJSON()).toEqual(before);
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(1);
  // 収まる変更はできる
  expect(graph.batch(() => graph.update(1, { caption: "直した" }))).toBe(true);
  expect(graph.history().canUndo).toBe(true);
});

test("LLM が書いたまま紙の外にある箱があっても、ほかの箱の操作は断らない", () => {
  const w = PAPERS["a4-landscape"].w;
  const { graph } = setup({ nodes: [{ id: 1, caption: "中", x: 40, y: 40 }, { id: 2, caption: "外", x: w + 100, y: 40 }] });
  graph.update(1, { caption: "直した" });
  expect(graph.info(1).caption).toBe("直した");
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(0);
});

test("紙の型を変える: 大きくするのはできる。小さくして箱がはみ出すなら断る。既定の型を選べばデータから消す", () => {
  const { graph, world } = setup({ nodes: [{ id: 1, caption: "右の箱", x: 900, y: 40 }] }); // A4 横（1123 幅）の中
  graph.update(null, { paper: "a3-landscape" });
  expect(sizeOf(world)).toEqual([PAPERS["a3-landscape"].w, PAPERS["a3-landscape"].h]);
  expect(graph.toJSON().world?.paper).toBe("a3-landscape");
  // A5 横（794 幅）にすると x 900 の箱がはみ出すので断る
  expect(graph.batch(() => graph.update(null, { paper: "a5-landscape" }))).toBe(false);
  expect(graph.toJSON().world?.paper).toBe("a3-landscape");
  // 既定（A4 横）に戻すと、データから消す
  graph.update(null, { paper: DEFAULT_PAPER });
  expect(graph.toJSON().world?.paper).toBeUndefined();
  expect(sizeOf(world)).toEqual([PAPERS[DEFAULT_PAPER].w, PAPERS[DEFAULT_PAPER].h]);
});
