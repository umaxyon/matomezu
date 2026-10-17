// 図の操作 × ページのパターン・箱の見せ方の組み合わせ（2026-10-17。起点 AI のテストの見直し）。
// パターンと見せ方の並びは表（STRATEGIES・PAGE_PATTERNS・BOX_VIEWS）から読んで回す（CLAUDE.md: 名前を直接比べる判定を散らさない）。
// 確かめること: パターンをまたぐ操作を断る（refusePattern）、操作のあとの Undo / Redo でデータが完全に戻る・進む、
// 見せ方を何度切り替えても自由に置いた子孫の位置を失わない（setView）、貼り付けの行き先（D23）、紙からはみ出す操作を断る（D33）
import { afterEach, describe, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
import { BOX_VIEWS, PAGE_PATTERNS, PAPERS } from "../web/src/validate";
import type { BoxData, Diagram, PagePattern } from "../web/src/types";
import { dragBy, fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

type Ev = { kind: string; [k: string]: unknown };
function setup(data: Diagram, extra: Record<string, unknown> = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const events: Ev[] = [];
  let changes = 0;
  const graph = createGraph(el, data, {
    measureText: fakeMeasure, onEvent: ev => events.push(ev as Ev), onChange: () => changes++, ...extra,
  });
  graphs.push(graph);
  return { graph, el, events, changes: () => changes };
}
const nodeOf = (g: Graph, id: string | number) => g.toJSON().nodes.find(n => String(n.id) === String(id));
const kinds = (events: Ev[]) => events.map(e => e.kind);

// 新しい図・新しいページで選べるパターン（マスターは選ばせない）。最初のページは内包
const PICKABLE = PAGE_PATTERNS.filter(p => STRATEGIES[p].pick);
const pageId = (p: PagePattern, i: 1 | 2) => `${p}${i}`;

// パターンごとに 2 枚ずつページを持つブック。どのページにも、根の外の葉の箱（id は 100 + 連番）を 1 つ置く。
// ツリーのページには根（id は 200 + 連番）と、その子を 1 つ置く
function book(): Diagram {
  const pages: NonNullable<Diagram["pages"]> = [];
  const nodes: BoxData[] = [{ id: 1, caption: "最初", x: 40, y: 40 }];
  let n = 0;
  for (const p of PICKABLE) for (const i of [1, 2] as const) {
    n++;
    const id = pageId(p, i);
    const world: Record<string, unknown> = { childView: p };
    if (STRATEGIES[p].rootOnly) {
      world.root = 200 + n;
      nodes.push({ id: 200 + n, caption: `根${n}`, page: id, x: 40, y: 40 }, { id: 300 + n, caption: `根の子${n}`, parent: 200 + n });
    }
    pages.push({ id, title: id, world });
    nodes.push({ id: 100 + n, caption: `葉${n}`, page: id, x: 400, y: 300 });
  }
  return { pages, nodes, edges: [] } as Diagram;
}
// ページ p（1 枚目か 2 枚目）の、根の外の葉の箱の id
const leafOn = (p: PagePattern, i: 1 | 2) => String(100 + PICKABLE.indexOf(p) * 2 + i);

describe("パターンをまたぐ操作は断る（refusePattern）。同じパターンのページどうしなら移せる", () => {
  const pairs = PICKABLE.flatMap(from => PICKABLE.map(to => [from, to] as const));

  test.each(pairs)("付け替え: %s のページの箱を %s のページの最上位へ", (from, to) => {
    const { graph, events, changes } = setup(book());
    graph.setPage(pageId(to, 2));
    const id = leafOn(from, 1);
    const before = graph.toJSON(), c0 = changes();
    const ok = graph.reparent(id, null, { x: 40, y: 400 });
    if (from === to) {
      expect(ok).toBe(true);
      expect(nodeOf(graph, id)!.page).toBe(pageId(to, 2));
      expect(changes() - c0).toBe(1);
    } else {
      expect(ok).toBe(false);
      expect(events.filter(e => e.kind === "crossPattern")).toEqual([{ kind: "crossPattern", from, to }]);
      expect(graph.toJSON()).toEqual(before);
      expect(changes()).toBe(c0);
      expect(graph.history().canUndo).toBe(false);
    }
  });

  test.each(pairs)("戻す: %s のページで消した箱を %s のページへ", (from, to) => {
    const { graph, events } = setup(book());
    const id = leafOn(from, 1);
    graph.setPage(pageId(from, 1));
    graph.remove(id);
    graph.setPage(pageId(to, 2));
    const before = graph.toJSON();
    const ok = graph.restore(id, null, { x: 40, y: 400 });
    if (from === to) {
      expect(ok).toBe(true);
      expect(nodeOf(graph, id)!.page).toBe(pageId(to, 2));
      expect(graph.toJSON().removed ?? []).toHaveLength(0);
    } else {
      expect(ok).toBe(false);
      expect(events.at(-1)).toEqual({ kind: "crossPattern", from, to });
      expect(graph.toJSON()).toEqual(before);
    }
  });

  test.each(pairs)("コピー・貼り付け: %s のページで写した箱を %s のページのワールドへ", (from, to) => {
    const { graph, events } = setup(book());
    graph.setPage(pageId(from, 1));
    graph.select(leafOn(from, 1));
    expect(graph.copySelected()).toBe(true);
    graph.setPage(pageId(to, 2));
    graph.select(null);
    const before = graph.toJSON();
    const ok = graph.pasteClip();
    if (from === to) {
      expect(ok).toBe(true);
      const s = nodeOf(graph, graph.selected()!)!;
      expect([s.caption, s.page]).toEqual([nodeOf(graph, leafOn(from, 1))!.caption, pageId(to, 2)]);
    } else {
      expect(ok).toBe(false);
      expect(events.at(-1)).toEqual({ kind: "crossPattern", from, to });
      expect(graph.toJSON()).toEqual(before);
    }
  });
});

// ---- 操作のあとの Undo / Redo ----
// 操作の前のデータ → 操作 → Undo で操作の前と同じ、Redo で操作の後と同じ（位置・並び順・removed・線まで）。
// prep は操作の前の準備（履歴に積んでよい。比べるのは op の前後だけ）。on はその操作ができるパターンか（表から読む）
interface Op {
  name: string;
  on: (p: PagePattern) => boolean;
  prep?: (g: Graph, p: PagePattern) => void;
  op: (g: Graph, p: PagePattern) => unknown;
}
const any = () => true;
const partnerOf = (p: PagePattern) => 1000 + PICKABLE.indexOf(p);
const edgeIds = (g: Graph) => (g.toJSON().edges ?? []).map(e => (Array.isArray(e) ? "" : String(e.id)));
const OPS: Op[] = [
  { name: "最上位に箱を足す", on: any, op: g => g.add({ parentId: null, at: { x: 40, y: 450 } }, { caption: "足した" }) },
  { name: "箱を消す", on: any, op: (g, p) => g.remove(leafOn(p, 1)) },
  {
    name: "消した箱を戻す", on: any,
    prep: (g, p) => g.remove(leafOn(p, 1)),
    op: (g, p) => g.restore(leafOn(p, 1), null, { x: 40, y: 450 }),
  },
  {
    name: "足して消した箱を完全に削除する", on: any,
    prep: g => { g.remove(g.add({ parentId: null, at: { x: 40, y: 450 } }, { caption: "足した" })); },
    op: g => g.purge(g.toJSON().removed!.at(-1)!.id!),
  },
  { name: "キャプションを変える", on: any, op: (g, p) => g.update(leafOn(p, 1), { caption: "直した" }) },
  // 線を引けるのは、最上位の箱を置く戦略が線を引ける（link）パターン
  { name: "線を引く", on: p => STRATEGIES[STRATEGIES[p].tops].link, op: (g, p) => g.link(leafOn(p, 1), partnerOf(p)) },
  {
    name: "線を消す", on: p => STRATEGIES[STRATEGIES[p].tops].link,
    prep: (g, p) => g.link(leafOn(p, 1), partnerOf(p)),
    op: g => g.removeEdge(edgeIds(g)[0]!),
  },
  {
    name: "写した箱をワールドに貼る", on: p => STRATEGIES[p].copy === "boxes",
    prep: (g, p) => { g.select(leafOn(p, 1)); g.copySelected(); g.select(null); },
    op: g => g.pasteClip(),
  },
  { name: "同じパターンのほかのページの箱を付け替える", on: any, op: (g, p) => g.reparent(leafOn(p, 2), null, { x: 40, y: 450 }) },
  // ツリーを平らにする変換は、子孫全体を並べる戦略のページだけ（戻せない変換だが、Undo では戻る）
  { name: "ツリーを内包に変換する", on: p => STRATEGIES[p].descendants, op: g => g.flattenTree() },
];

describe("操作のあとの Undo で操作の前のデータに、Redo で操作の後のデータに完全に戻る", () => {
  // 線を引く相手として、どのパターンにも 2 つ目の葉（partnerOf）を 1 枚目のページに置く
  const withPartner = (): Diagram => {
    const d = book();
    for (const p of PICKABLE) d.nodes.push({ id: partnerOf(p), caption: "相手", page: pageId(p, 1), x: 700, y: 300 });
    return d;
  };
  const cases = OPS.flatMap(o => PICKABLE.filter(o.on).map(p => [o.name, p, o] as const));
  test.each(cases)("%s（%s のページ）", (_name, p, o) => {
    const { graph } = setup(withPartner());
    graph.setPage(pageId(p, 1));
    o.prep?.(graph, p);
    const before = graph.toJSON();
    o.op(graph, p);
    const after = graph.toJSON();
    expect(after).not.toEqual(before);
    expect(graph.undo()).toBe(true);
    expect(graph.toJSON()).toEqual(before);
    expect(graph.page()).toBe(pageId(p, 1));
    expect(graph.redo()).toBe(true);
    expect(graph.toJSON()).toEqual(after);
  });

  // edits.ts の restoreSubtree・purgeRemoved と同じく、空になった removed は項目ごと無くす（Undo のあとに removed: [] が残っていた。X8）
  test("箱を消して Undo すると、removed の項目ごと消える（空の配列を残さない）", () => {
    const { graph } = setup(withPartner());
    const before = graph.toJSON();
    graph.remove(1);
    graph.undo();
    expect(graph.toJSON()).toEqual(before);
    expect("removed" in graph.toJSON()).toBe(false);
  });
});

// ---- 箱の見せ方の切り替え（setView）は、自由に置いた子孫の位置を失わない ----
// 1 は子 2・3 を持ち、2 は孫 4 を持つ（内包のときの位置をデータに持つ）。見せ方を v → w と切り替えて内包に戻すと、
// データの位置も、描いた位置も、最初と同じ
describe("見せ方を何度切り替えて内包に戻しても、子と孫の位置はデータでも画面でも元のまま", () => {
  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "親", x: 40, y: 40 },
      { id: 2, caption: "子A", parent: 1, x: 12, y: 30 },
      { id: 3, caption: "子B", parent: 1, x: 260, y: 90 },
      { id: 4, caption: "孫", parent: 2, x: 30, y: 50 },
    ],
  });
  const OTHERS = BOX_VIEWS.filter(v => STRATEGIES[v].onBox && v !== BOX_VIEWS[0]);
  const seqs = OTHERS.flatMap(v => OTHERS.map(w => [v, w] as const));
  const where = (g: Graph) => [2, 3, 4].map(id => { const i = g.info(id); const s = nodeOf(g, id)!; return [s.x, s.y, i.x, i.y, i.w, i.h]; });
  test.each(seqs)("内包 → %s → %s → 内包（切り替える前に、子と孫をドラッグで動かしておく）", (v, w) => {
    const { graph, el } = setup(data());
    dragBy(el, graph, 3, 40, 60);
    dragBy(el, graph, 4, 10, 20);
    graph.select(null);
    const first = where(graph);
    expect(first[1]!.slice(2, 4)).not.toEqual([260, 90]); // 動いている
    const nest = BOX_VIEWS[0];
    expect(STRATEGIES[nest].free).toBe(true); // 内包は自由に置く見せ方（最初の見せ方を既定とする前提を確かめる）
    for (const view of [v, w, nest]) graph.update(1, { childView: view });
    expect(where(graph)).toEqual(first);
    expect(nodeOf(graph, 1)!.childView).toBeUndefined(); // 既定（内包）はデータに書かない
  });
  test.each(OTHERS)("%s の箱の子を、内包の箱へ付け替えても、元の見せ方に戻せば残った子の位置は元のまま", v => {
    const { graph } = setup({ nodes: [...data().nodes, { id: 9, caption: "入れ物", x: 600, y: 40 }] });
    graph.update(1, { childView: v });
    graph.reparent(2, 9);
    graph.update(1, { childView: BOX_VIEWS[0] });
    expect([nodeOf(graph, 3)!.x, nodeOf(graph, 3)!.y]).toEqual([260, 90]);
    expect(String(nodeOf(graph, 2)!.parent)).toBe("9");
    expect(String(nodeOf(graph, 4)!.parent)).toBe("2"); // 子孫ごと移る
  });
});

// ---- 貼り付けの行き先（D23）: 選んだ箱の見せ方ごと ----
describe("箱を選んで貼ると、その箱が子を持てるならその中、持てなければ隣（見せ方は変えない）", () => {
  const data = (): Diagram => ({
    pages: [{ id: "t", title: "木", world: { childView: "tree", root: 20 } }, { id: "n2", title: "別" }],
    nodes: [
      { id: 1, caption: "写すもの", x: 40, y: 400 }, { id: 2, caption: "写すものの子", parent: 1 },
      // 子を持つ箱を、内包パターンの見せ方ごとに 1 つずつ（id は 10 + 見せ方の番号）
      ...BOX_VIEWS.flatMap((v, i) => [
        { id: 10 + i, caption: `入れ物${v}`, childView: v, x: 40 + i * 300, y: 40 } as BoxData,
        { id: 50 + i, caption: `中${v}`, parent: 10 + i } as BoxData,
      ]),
      { id: 30, caption: "窓", link: "n2", x: 700, y: 400 },
      { id: 20, caption: "根", page: "t", x: 40, y: 40 }, { id: 21, caption: "根の子", parent: 20 },
      { id: 22, caption: "根の外", page: "t", x: 500, y: 40 },
    ],
    edges: [],
  });

  test.each(BOX_VIEWS.map((v, i) => [v, i] as const))("%s の箱を選んで貼ると、その箱の子になり、子孫も写る。見せ方のデータは変わらない", (v, i) => {
    const { graph } = setup(data());
    graph.select(1);
    graph.copySelected();
    graph.select(10 + i);
    expect(graph.pasteClip()).toBe(true);
    const id = graph.selected()!;
    expect(String(nodeOf(graph, id)!.parent)).toBe(String(10 + i));
    expect(graph.toJSON().nodes.filter(n => String(n.parent) === id).map(n => n.caption)).toEqual(["写すものの子"]);
    expect(nodeOf(graph, 10 + i)!.childView).toBe(v);
    expect(graph.toJSON().nodes.filter(n => String(n.parent) === String(10 + i))).toHaveLength(2);
  });

  test("リンクの箱（窓）は子を持てないので、隣（同じ親の中、すぐ右）に貼る", () => {
    const { graph } = setup(data());
    graph.select(1);
    graph.copySelected();
    graph.select(30);
    expect(graph.pasteClip()).toBe(true);
    const s = nodeOf(graph, graph.selected()!)!;
    expect([s.caption, s.parent ?? null]).toEqual(["写すもの", null]);
    expect(Number(s.x)).toBeGreaterThan(Number(nodeOf(graph, 30)!.x));
  });

  test("ツリーのページ: 根と根の子孫を選べばその中、根の外の葉を選べば隣。子を持つ箱は根の外へは貼らない", () => {
    const { graph, events } = setup(data());
    graph.setPage("t");
    graph.select(22);
    graph.copySelected();
    for (const [sel, parent] of [[20, "20"], [21, "21"], [22, null]] as const) {
      graph.select(sel);
      expect(graph.pasteClip()).toBe(true);
      expect(nodeOf(graph, graph.selected()!)!.parent ?? null).toBe(parent == null ? null : Number(parent));
    }
    // 子を持つ箱（根の子）を写して根の外の葉を選ぶと、隣（最上位）になるが、ツリーのページの最上位は子を持てない（rootOnly）ので断る
    const id = graph.add({ parentId: "21", at: { x: 0, y: 0 } }, { caption: "孫" });
    expect(nodeOf(graph, id)).toBeTruthy();
    graph.select(21);
    graph.copySelected();
    graph.select(22);
    const before = graph.toJSON();
    expect(graph.pasteClip()).toBe(false);
    expect(events.at(-1)!.kind).toBe("leafKids");
    expect(graph.toJSON()).toEqual(before);
  });
});

// ---- 子を持てない戦略（leafKids）へ、子を持つ箱を入れない ----
describe("フローチャートのページ（子は子を持てない）へ、子を持つ箱を移植・戻すことはしない", () => {
  const flow = PICKABLE.find(p => STRATEGIES[p].leafKids)!;
  test("移植（ほかのブックの子孫つきの箱）は leafKids で断り、データは変わらない", () => {
    const { graph, events } = setup({ world: { childView: flow }, nodes: [{ id: 1, caption: "開始", x: 40, y: 40 }] });
    const before = graph.toJSON();
    const id = graph.paste({ root: "a", nodes: [{ id: "a", caption: "親" }, { id: "b", caption: "子", parent: "a" }], edges: [], pattern: flow }, null, { x: 300, y: 40 });
    expect(id).toBe("");
    expect(events.at(-1)!.kind).toBe("leafKids");
    expect(graph.toJSON()).toEqual(before);
    // 子の無い箱なら移植できる
    expect(graph.paste({ root: "a", nodes: [{ id: "a", caption: "葉" }], edges: [], pattern: flow }, null, { x: 300, y: 40 })).not.toBe("");
  });
  test("箱の中へは付け替え・足すことができない（例外）", () => {
    const { graph } = setup({ world: { childView: flow }, nodes: [{ id: 1, caption: "開始", x: 40, y: 40 }, { id: 2, caption: "処理", x: 40, y: 200 }] });
    const before = graph.toJSON();
    expect(() => graph.reparent(2, 1)).toThrow();
    expect(() => graph.add({ parentId: "1" }, { caption: "中" })).toThrow();
    expect(graph.toJSON()).toEqual(before);
  });
});

// ---- 付け替えの行き先: 見せ方ごと ----
describe("付け替え: 落とし先の見せ方は変えない。自由に置く見せ方なら今ある子の下に置く。Undo で戻る", () => {
  test.each(BOX_VIEWS.map(v => [v] as const))("%s の箱へ付け替える", v => {
    const nodes: BoxData[] = [
      { id: 1, caption: "動かす", x: 40, y: 400 },
      { id: 10, caption: "入れ物", childView: v, x: 40, y: 40 }, { id: 11, caption: "中", parent: 10, x: 12, y: 30 },
    ];
    const { graph } = setup({ nodes });
    expect(graph.reparent(1, 10)).toBe(true);
    const s = nodeOf(graph, 1)!;
    expect(String(s.parent)).toBe("10");
    expect(nodeOf(graph, 10)!.childView).toBe(v);
    // 自由に置く見せ方（内包）なら今ある子の下に置く（ほかの見せ方は並べ方が決める）
    if (STRATEGIES[v].free) expect(Number(s.y)).toBeGreaterThan(30);
    graph.undo();
    expect(nodeOf(graph, 1)!.parent).toBeUndefined();
  });
  test("リンクの箱の中へは付け替えられない（子を持てない）。リンクの箱そのものは内包の箱へ移せる", () => {
    const { graph } = setup({
      pages: [{ id: "n2" }],
      nodes: [{ id: 1, caption: "動かす", x: 40, y: 400 }, { id: 2, caption: "窓", link: "n2", x: 400, y: 400 }, { id: 3, caption: "入れ物", x: 40, y: 40 }],
    });
    expect(() => graph.reparent(1, 2)).toThrow();
    expect(graph.reparent(2, 3)).toBe(true);
    expect(String(nodeOf(graph, 2)!.parent)).toBe("3");
    expect(nodeOf(graph, 2)!.link).toBe("n2");
  });
});

// ---- 紙（D33） ----
describe("紙のページ: 操作で箱が紙からはみ出すなら断る", () => {
  const paper = "a5-landscape" as const;
  const { w, h } = PAPERS[paper];
  const LONG = "続き\n".repeat(60); // 紙の高さ（559）より高い本文
  const make = () => setup({ world: { paper }, nodes: [{ id: 1, caption: "中", x: 40, y: 40 }] }, { paper: true });

  test("紙の外を押して足しても、紙の中に置く", () => {
    const { graph } = make();
    const id = graph.add({ parentId: null, at: { x: w + 300, y: h + 300 } }, { caption: "端" });
    const i = graph.info(id);
    expect(i.x + i.w).toBeLessThanOrEqual(w);
    expect(i.y + i.h).toBeLessThanOrEqual(h);
  });

  // 構造が変わる操作（add・paste・restore・reparent など）は rebuildWith で作り直す。作り直しても「前から紙の外にあった箱」を覚え直さず、
  // 操作で新しくはみ出す箱ができたら changed の refuseOverPaper が断る（CLAUDE.md 15。2026-10-17、テストの見直しで見つけた X2）。
  // Ctrl+V の貼り付けは、収まらなければ黙って貼らない（2026-10-17 ユーザー）。ほかの操作は知らせる
  const OVER: [string, (g: Graph) => unknown, boolean][] = [
    ["足す", g => g.add({ parentId: null, at: { x: 40, y: 40 } }, { caption: "長い", body: LONG }), true],
    ["移植する", g => g.paste({ root: "a", nodes: [{ id: "a", caption: "長い", body: LONG }], edges: [], pattern: "nest" }, null, { x: 40, y: 40 }), true],
  ];
  test.each(OVER)("本文の長い箱を%sと紙からはみ出すので、しない", (_name, op, warn) => {
    const { graph, events } = make();
    const before = graph.toJSON();
    op(graph);
    expect(graph.toJSON()).toEqual(before);
    expect(kinds(events).includes("overPaper")).toBe(warn);
    expect(kinds(events).some(k => k === "added" || k === "pasted")).toBe(false);
    expect(graph.history().canUndo).toBe(false);
  });
  test("Ctrl+V で、紙に収まらない箱は黙って貼らない（大きい紙のページで写して、小さい紙のページへ貼る）", () => {
    const { graph, events } = setup({
      world: { paper: "a3-portrait" }, pages: [{ id: "s", world: { paper } }],
      nodes: [{ id: 1, caption: "長い", body: LONG, x: 40, y: 40 }, { id: 2, caption: "中", page: "s", x: 40, y: 40 }],
    }, { paper: true });
    graph.select(1);
    expect(graph.copySelected()).toBe(true);
    graph.setPage("s");
    graph.select(null);
    const before = graph.toJSON();
    expect(graph.pasteClip()).toBe(false);
    expect(graph.toJSON()).toEqual(before);
    expect(kinds(events).some(k => k === "overPaper" || k === "pasted")).toBe(false);
  });
});

// ---- ツリーの根（world.root）は消せない ----
// ツリーのページの根は消せない（docs/PATTERN-plan.md 8.2 の 2、types.ts の BoxInfo.treeRoot）。消すと world.root が消えた箱を指し、
// 保存したファイルを開き直せなくなっていた（2026-10-17、テストの見直しで見つけた X1）。根の子孫（根以外）は消せる
describe("ツリーのページの根", () => {
  const tree = PICKABLE.find(p => STRATEGIES[p].rootOnly)!;
  const data = (): Diagram => ({
    world: { childView: tree, root: 20 },
    nodes: [{ id: 20, caption: "根" }, { id: 21, caption: "根の子", parent: 20 }, { id: 22, caption: "外", x: 400, y: 40 }],
  });
  test("根は消せず、知らせて断る。データは開き直せるまま", () => {
    const { graph, events } = setup(data());
    const before = graph.toJSON();
    expect(graph.remove(20)).toBe(false);
    expect(events.at(-1)).toEqual({ kind: "rootKept" });
    expect(graph.toJSON()).toEqual(before);
    expect(() => graph.load(graph.toJSON())).not.toThrow();
  });
  test("ほかのページ（描いていないツリーのページ）の根も、一覧の × から消せない", () => {
    const { graph, events } = setup({
      pages: [{ id: "t", world: { childView: tree, root: 20 } }],
      nodes: [{ id: 1, caption: "表" }, { id: 20, caption: "根", page: "t" }, { id: 21, caption: "根の子", parent: 20 }],
    });
    const before = graph.toJSON();
    expect(graph.remove(20)).toBe(false);
    expect(events.at(-1)).toEqual({ kind: "rootKept" });
    expect(graph.toJSON()).toEqual(before);
    expect(graph.remove(21)).toBe(true);
  });
  test("根の子は消せ、Undo で戻る。根の外の葉も消せる", () => {
    const { graph } = setup(data());
    const before = graph.toJSON();
    expect(graph.remove(21)).toBe(true);
    expect(graph.remove(22)).toBe(true);
    expect(graph.toJSON().nodes.map(n => n.id)).toEqual([20]);
    expect(() => graph.load(graph.toJSON(), { keepHistory: true })).not.toThrow();
    graph.undo();
    graph.undo();
    expect(graph.toJSON().nodes).toEqual(before.nodes);
  });
  test("根は根の子孫の中へは付け替えられない（例外）。根の外の葉の中へも入れられない", () => {
    const { graph } = setup(data());
    expect(() => graph.reparent(20, 21)).toThrow();
    expect(() => graph.reparent(21, 22)).toThrow();
    expect(graph.toJSON().nodes.map(n => [n.id, n.parent ?? null])).toEqual([[20, null], [21, 20], [22, null]]);
  });
});
