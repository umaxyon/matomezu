// 紙（D33。docs/PAPER-plan.md）: 紙の制限を受けるパターンのページは、紙の型（world.paper。無ければ A4 横）の大きさに固定する。
// マスターは受けない。LLM への要約のはみ出しは紙に対して数え、開いたときに箱を表示領域へ寄せる調整（fitToViewport）はしない
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, type Graph, createGraph } from "../web/src/graph";
import { summarize } from "../web/src/report";
import { DEFAULT_PAPER, PAPERS, problems } from "../web/src/validate";
import type { Diagram } from "../web/src/types";
import { dragBy, fakeMeasure } from "./helpers";

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

test("紙の端: つかんで紙の右下の外へ動かすと、紙の内側の余白（padding）の手前で止まる。左上の外へは余白の内側で止まる", () => {
  const { w, h } = PAPERS["a4-landscape"];
  const { graph } = setup({ nodes: [{ id: 1, caption: "箱", x: 400, y: 300 }] });
  const b = graph.info(1);
  dragBy(document.body, graph, 1, w * 2, h * 2);
  expect([graph.info(1).x, graph.info(1).y]).toEqual([w - DEFAULTS.padding - b.w, h - DEFAULTS.padding - b.h]);
  dragBy(document.body, graph, 1, -w * 2, -h * 2);
  expect([graph.info(1).x, graph.info(1).y]).toEqual([DEFAULTS.padding, DEFAULTS.padding]);
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(0);
});

test("紙の端の境目: 右の余白にちょうど接する箱は紙の中、1px 越えれば紙の外として要約に出る", () => {
  const { w } = PAPERS["a4-landscape"];
  const bw = setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }).graph.info(1).w;
  graph!.destroy();
  const inside = setup({ nodes: [{ id: 1, caption: "箱", x: w - DEFAULTS.padding - bw, y: 40 }] }).graph;
  expect(inside.geometry().outside ?? []).toEqual([]);
  graph!.destroy();
  const over = setup({ nodes: [{ id: 1, caption: "箱", x: w - DEFAULTS.padding - bw + 1, y: 40 }] }).graph;
  expect(over.geometry().outside).toEqual(["1"]);
  expect(over.info(1).x).toBe(w - DEFAULTS.padding - bw + 1); // 寄せずにそのまま見せる
});

test("リストの高さの上限（listHeight）: そこで止まり、隠れた子は配置の結果に入らず、要約に何件中何件が見えているかが出る。消すと中身の高さに戻る", () => {
  const kids = Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, caption: `項目${i + 1}`, parent: 1 })); // 全部見せても紙（A4 横）に収まる数
  const { graph } = setup({ nodes: [{ id: 1, caption: "リスト", childView: "list", listHeight: 200, x: 40, y: 40 }, ...kids] } as Diagram);
  expect(graph.info(1).h).toBe(200);
  expect((graph.info(1) as import("../web/src/types").BoxInfo).listHeight).toBe(200);
  const g = graph.geometry();
  const list = g.boxes.find(b => b.id === "1")!;
  expect(list.scroll!.total).toBe(8);
  expect(list.scroll!.shown).toBeLessThan(8);
  expect(g.boxes.filter(b => b.ancestors[0] === "1")).toHaveLength(list.scroll!.shown);
  expect(summarize(g)).toMatch(/^scroll 1: #1 リスト \(shown \d+ of 8\)$/m);
  graph.update(1, { listHeight: null });
  expect(graph.info(1).h).toBeGreaterThan(200);
  expect(graph.toJSON().nodes.find(n => n.id === 1)!.listHeight).toBeUndefined();
});
