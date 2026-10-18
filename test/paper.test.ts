// 紙（D33。docs/PAPER-plan.md）: 紙の制限を受けるパターンのページは、紙の型（world.paper。無ければ A4 横）の大きさに固定する。
// マスターは受けない。LLM への要約のはみ出しは紙に対して数え、開いたときに箱を表示領域へ寄せる調整（fitToViewport）はしない。
// 開いたとき、紙の外に書かれた箱は形を変えずに押し込み、入らなければ開かない（docs/PAPER-plan.md の 4.6 の 7）
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, type Graph, createGraph } from "../web/src/graph";
import { PaperMisfit } from "../web/src/paper-misfit";
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

test("開いたとき、紙の外に書かれた箱は形を変えずに紙の内側へ押し込む（docs/PAPER-plan.md の 4.6 の 7）。押し込んだらファイルに書き戻すよう知らせ、履歴には積まない", () => {
  const w = PAPERS["a4-landscape"].w;
  const changes: Diagram[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, { nodes: [{ id: 1, caption: "中", x: 40, y: 40 }, { id: 2, caption: "外", x: w + 100, y: 40 }] },
    { measureText: fakeMeasure, paper: true, onChange: d => changes.push(d) });
  const b = graph.info(2);
  expect([b.x, b.y]).toEqual([w - DEFAULTS.padding - b.w, 40]); // 右の端まで、横にだけ押し込む
  expect(graph.info(1).x).toBe(40);
  expect(changes.map(d => d.nodes.find(n => n.id === 2)?.x)).toEqual([b.x]);
  expect(graph.history().canUndo).toBe(false);
  expect(graph.misfits()).toEqual([]);
  expect(summarize(graph.geometry()).split("\n")[0]).toMatch(new RegExp(`^paper a4-landscape ${w}x${PAPERS["a4-landscape"].h}, content \\d+x\\d+ → fits`));
  // 紙の中だけなら書き戻さない
  graph.load({ nodes: [{ id: 1, caption: "中", x: 40, y: 40 }] });
  expect(changes).toHaveLength(1);
});

// 横に並んだ 12 個の箱（A4 横の幅 1123 に、間隔の下限 8px を詰めても入らない）
const tooWide = (extra: Partial<Diagram> = {}): Diagram => ({ ...extra, nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, caption: `横${i + 1}`, x: 12 + i * 130, y: 12 })) });

test("押し込んでも入らなければ: refuse なら描かずに前の表示に戻して PaperMisfit を投げる。refuse しなければ、そのまま描いて misfits と要約に理由を出す", () => {
  const { graph } = setup({ nodes: [{ id: 1, caption: "前の図", x: 40, y: 40 }] });
  let err: unknown = null;
  try { graph.load(tooWide(), { refuse: true }); } catch (e) { err = e; }
  expect(err).toBeInstanceOf(PaperMisfit);
  const m = (err as PaperMisfit).misfits;
  expect(m.map(x => [x.page, x.axis, x.boxes.length])).toEqual([[null, "x", 12]]);
  expect(m[0]!.short).toBeGreaterThan(0);
  expect((err as Error).message).toMatch(/^原因：ページ幅オーバー（\d+px）$/);
  expect(graph.toJSON().nodes.map(n => n.caption)).toEqual(["前の図"]); // 前の表示のまま
  expect(graph.misfits()).toEqual([]);
  graph.load(tooWide());
  expect(graph.misfits().map(x => x.page)).toEqual([null]);
  expect(graph.info(12).x).toBe(12 + 11 * 130); // 押し込まずに、書かれた位置のまま
  expect(summarize(graph.geometry()).split("\n")[1]).toMatch(/^does not fit: the row #1 横1, .*#12 横12 is \d+px wider than the paper/);
});

test("開くときの判定は全部のページ: 描かないページが入らなくても断る。描かないページで押し込んだ位置もデータに入る", () => {
  const w = PAPERS["a4-landscape"].w;
  const page2 = (nodes: Diagram["nodes"]): Diagram => ({ pages: [{ id: "p2", title: "二枚目" }], nodes: [{ id: 100, caption: "一枚目", x: 40, y: 40 }, ...nodes] } as Diagram);
  const { graph } = setup({ nodes: [{ id: 1, caption: "前", x: 40, y: 40 }] });
  const wide = tooWide().nodes.map(n => ({ ...n, id: Number(n.id) + 200, page: "p2" }));
  expect(() => graph.load(page2(wide), { refuse: true })).toThrow(/^原因：二枚目 ページ幅オーバー（\d+px）$/);
  expect(graph.page()).toBeNull();
  graph.load(page2([{ id: 300, caption: "外", x: w + 100, y: 40, page: "p2" }]));
  expect(graph.page()).toBeNull(); // 描くのは最初のページのまま
  const moved = graph.toJSON().nodes.find(n => n.id === 300)!;
  expect(moved.x).toBeLessThan(w);
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


test("紙の型を変える: 大きくするのはできる。小さくするときは、形を変えずに押し込めば入るなら押し込み、入らなければ断る。既定の型を選べばデータから消す", () => {
  const { graph, world } = setup({ nodes: [{ id: 1, caption: "左の箱", x: 40, y: 40 }, { id: 2, caption: "右の箱", x: 900, y: 40 }] }); // A4 横（1123 幅）の中
  graph.update(null, { paper: "a3-landscape" });
  expect(sizeOf(world)).toEqual([PAPERS["a3-landscape"].w, PAPERS["a3-landscape"].h]);
  expect(graph.toJSON().world?.paper).toBe("a3-landscape");
  // A5 横（794 幅）: x 900 の箱は横にだけ押し込まれて入る
  expect(graph.batch(() => graph.update(null, { paper: "a5-landscape" }))).toBe(true);
  expect(graph.info(2).x).toBe(PAPERS["a5-landscape"].w - DEFAULTS.padding - graph.info(2).w);
  expect(graph.info(1).x).toBe(40);
  // 既定（A4 横）に戻すと、データから消す
  graph.update(null, { paper: DEFAULT_PAPER });
  expect(graph.toJSON().world?.paper).toBeUndefined();
  expect(sizeOf(world)).toEqual([PAPERS[DEFAULT_PAPER].w, PAPERS[DEFAULT_PAPER].h]);
  // 並びを詰めても A5 横に入らない図は断る
  graph.load(tooWide({ world: { paper: "a3-landscape" } }));
  expect(graph.batch(() => graph.update(null, { paper: "a5-landscape" }))).toBe(false);
  expect(graph.toJSON().world?.paper).toBe("a3-landscape");
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

test("紙の端の境目: 右の余白にちょうど接する箱は紙の中でそのまま、1px 越えれば紙の外なので、開いたときに余白の手前まで押し込む", () => {
  const { w } = PAPERS["a4-landscape"];
  const bw = setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }).graph.info(1).w;
  graph!.destroy();
  const inside = setup({ nodes: [{ id: 1, caption: "箱", x: w - DEFAULTS.padding - bw, y: 40 }] }).graph;
  expect(inside.geometry().outside ?? []).toEqual([]);
  graph!.destroy();
  const over = setup({ nodes: [{ id: 1, caption: "箱", x: w - DEFAULTS.padding - bw + 1, y: 40 }] }).graph;
  expect(over.geometry().outside).toEqual([]);
  expect(over.info(1).x).toBe(w - DEFAULTS.padding - bw);
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
