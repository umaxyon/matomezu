// ブックとページ（docs/TABS-plan.md 3.2）。図はブック全体を持ち、描くのは 1 ページだけ
import { afterEach, expect, test } from "bun:test";
import { noticeOf } from "../web/src/notices";
import { createGraph, type Graph } from "../web/src/graph";
import { copySubtree, dataPaint, pageMembers, pageNameOf, pageOf, subtreeIds } from "../web/src/pages";
import { DEFAULTS } from "../web/src/graph";
import { themeById } from "../web/src/theme";
import type { BoxData, Diagram, EdgeData } from "../web/src/types";
import { validate } from "../web/src/validate";
import { dragBy, fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure });
  graphs.push(graph);
  return { el, graph };
}

// ブック。最初のページ: 1、2、6。ページ p1（「詳細」）: 3、4（4 は 5 を内包）。線は 1-2（最初のページ）、3-4（ページ p1）
const book = (): Diagram => ({
  world: { width: 900, background: "#ffffff" },
  pages: [{ id: "p1", title: "詳細", world: { background: "#101010" } }],
  nodes: [
    { id: 1, caption: "表", x: 40, y: 40 },
    { id: 2, caption: "隣", x: 400, y: 40 },
    { id: 3, caption: "中A", page: "p1", x: 20, y: 20 },
    { id: 4, caption: "中B", page: "p1", x: 300, y: 20 },
    { id: 5, caption: "孫", parent: 4, x: 12, y: 30 },
    { id: 6, caption: "下", x: 40, y: 300 },
  ],
  edges: [
    { id: "e1", from: 1, to: 2 },
    { id: "e2", from: 3, to: 4 },
  ],
});

const drawn = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".mz-node")].map(n => n.dataset.id).sort();
const node = (d: Diagram, id: number) => d.nodes.find(n => n.id === id)!;
const edgeIds = (d: Diagram) => (d.edges as EdgeData[]).map(e => e.id);

test("ページの関数: 箱の載っているページ（最上位の祖先の page）、ページの中身、子孫、ページの名前", () => {
  const d = book();
  const n = d.nodes;
  expect(pageOf(n, 1)).toBeNull();
  expect(pageOf(n, 3)).toBe("p1");
  expect(pageOf(n, 5)).toBe("p1");
  expect(pageMembers(n, null)).toEqual(["1", "2", "6"]);
  expect(pageMembers(n, "p1")).toEqual(["3", "4", "5"]);
  expect([...subtreeIds(n, 4)].sort()).toEqual(["4", "5"]);
  expect([pageNameOf(d, null), pageNameOf(d, "p1")]).toEqual(["最初のページ", "詳細"]);
  expect(pageNameOf({ pages: [{ id: "p9" }], nodes: [] }, "p9")).toBe("p9_(空)");
});

test("最初のページでは、ほかのページの箱を描かない。保存しても中身と線はそのまま残る", () => {
  const { el, graph } = setup(book());
  expect(graph.page()).toBeNull();
  expect(drawn(el)).toEqual(["1", "2", "6"]);
  const out = graph.toJSON();
  expect(out.nodes).toEqual(book().nodes as BoxData[]);
  expect(out.pages).toEqual(book().pages);
  expect(edgeIds(out)).toEqual(["e1", "e2"]);
});

test("ページを描くと、そのページの箱が最上位に並び、ワールドの設定はそのページのものになる", () => {
  const { el, graph } = setup(book());
  graph.setPage("p1");
  expect(graph.page()).toBe("p1");
  expect(drawn(el)).toEqual(["3", "4", "5"]);
  expect(graph.info(null).children.map(c => c.id)).toEqual(["3", "4"]);
  const w = graph.info(null);
  expect(w.kind === "world" && w.background).toBe("#101010");
  expect(graph.toJSON().nodes).toEqual(book().nodes as BoxData[]);
});

test("ページの中で動かしても、ほかのページの箱と線は変わらない", () => {
  const { el, graph } = setup(book());
  graph.setPage("p1");
  dragBy(el, graph, 3, 0, 200);
  const out = graph.toJSON();
  expect(node(out, 3).y).toBeGreaterThan(20);
  for (const id of [1, 2, 6]) expect(node(out, id)).toEqual(node(book(), id));
  expect(edgeIds(out)).toEqual(["e1", "e2"]);
});

test("ページの背景を変えると、そのページの world に書き、ファイルの world は変えない。空になれば項目ごと消す", () => {
  const { graph } = setup(book());
  graph.setPage("p1");
  graph.update(null, { background: "#202020" });
  const out = graph.toJSON();
  expect(out.pages![0]!.world).toEqual({ background: "#202020" });
  expect(out.world).toEqual({ width: 900, background: "#ffffff" });
  graph.update(null, { background: null });
  expect(graph.toJSON().pages![0]).toEqual({ id: "p1", title: "詳細" });
});

test("ページの中で最上位へ付け替えると、そのページに載る（page を書く）。最初のページなら page を消す", () => {
  const { graph } = setup(book());
  graph.setPage("p1");
  graph.reparent(5, null, { x: 40, y: 200 });
  expect([node(graph.toJSON(), 5).parent, node(graph.toJSON(), 5).page]).toEqual([undefined, "p1"]);
  expect(graph.info(null).children.map(c => c.id)).toContain("5");
  graph.setPage(null);
  graph.reparent(5, null, { x: 40, y: 400 });
  expect([node(graph.toJSON(), 5).parent, node(graph.toJSON(), 5).page]).toEqual([undefined, undefined]);
});

test("ページの中で消して戻すと、戻した先はそのページの最上位", () => {
  const { graph } = setup(book());
  graph.setPage("p1");
  graph.remove(3);
  graph.restore(3, null, { x: 20, y: 200 });
  const out = graph.toJSON();
  expect([node(out, 3).parent, node(out, 3).page]).toEqual([undefined, "p1"]);
  expect(out.removed).toBeUndefined();
});

test("新しい線の id は、ほかのページの線と重ならない", () => {
  const { graph } = setup(book());
  // 最初のページには e1 だけが見えている。e2 はページ p1 の線
  graph.link(2, 6);
  // 空いている番号は e2 だが、ページ p1 の線が使っているので e3 になる
  expect(edgeIds(graph.toJSON())).toEqual(["e1", "e2", "e3"]);
});

test("ページを切り替えても Undo の履歴は 1 つ。戻すとページの中の変更も戻る", () => {
  const { graph } = setup(book());
  graph.setPage("p1");
  graph.update(3, { caption: "変えた" });
  graph.setPage(null);
  expect(node(graph.toJSON(), 3).caption).toBe("変えた");
  graph.undo();
  expect(node(graph.toJSON(), 3).caption).toBe("中A");
  expect(graph.page()).toBeNull();
});

test("描いていたページが無くなったら、最初のページに戻る（ページに載っていた箱は最初のページに出る）", () => {
  const { el, graph } = setup(book());
  graph.setPage("p1");
  const next = book();
  delete next.pages;
  for (const n of next.nodes) delete n.page;
  graph.load(next, { keepHistory: true });
  expect(graph.page()).toBeNull();
  expect(drawn(el)).toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("無いページは描けない", () => {
  const { graph } = setup(book());
  expect(() => graph.setPage("p9")).toThrow();
  expect(graph.page()).toBeNull();
});

test("データの検査: ページの id の重複、無いページ、中の箱の page、昔の page: true と箱の world は誤り（直し方を案内）", () => {
  const d = book();
  expect(() => validate({ ...d, pages: [...d.pages!, { id: "p1" }] })).toThrow(/重複/);
  expect(() => validate({ ...d, nodes: [...d.nodes, { id: 7, page: "p9" }] })).toThrow(/存在しないページ/);
  expect(() => validate({ ...d, nodes: [...d.nodes, { id: 7, parent: 4, page: "p1" }] })).toThrow(/最上位の箱にだけ/);
  expect(() => validate({ nodes: [{ id: 1, page: true as never }] })).toThrow(/pages に書き/);
  expect(() => validate({ nodes: [{ id: 1, world: {} as never }] })).toThrow(/pages の world/);
  expect(() => validate({ pages: [{ id: "p1", world: { childView: "list" } }], nodes: [] })).toThrow(/nest \/ tree \/ flow/);
});

test("pages はブックのページ（2 枚目から）の一覧", () => {
  const { graph } = setup(book());
  expect(graph.pages()).toEqual([{ id: "p1", caption: "詳細" }]);
});

test("ページを足す: 内包のページは空で、ツリーのページは根の箱を 1 つ置いて world.root にする。id は空いている p 番号", () => {
  const { graph } = setup(book());
  const nest = graph.addPage({ title: "次の話", world: {} });
  expect(nest).toBe("p2");
  expect(graph.toJSON().pages).toEqual([...book().pages!, { id: "p2", title: "次の話" }]);
  const tree = graph.addPage({ title: "組織", world: { childView: "tree", theme: "sticky" } });
  const out = graph.toJSON();
  const root = out.nodes.at(-1)!;
  expect([root.caption, root.page, root.parent, root.x, root.y]).toEqual(["組織", "p3", undefined, 40, 40]);
  expect(out.pages!.at(-1)).toEqual({ id: tree, title: "組織", world: { childView: "tree", theme: "sticky", root: root.id } });
  graph.setPage(tree);
  expect((graph.info(root.id!) as { treeRoot: boolean }).treeRoot).toBe(true);
  expect(graph.pages().map(p => p.caption)).toEqual(["詳細", "次の話", "組織"]);
  graph.undo();
  graph.undo();
  expect(graph.toJSON().pages).toEqual(book().pages);
});

// ---- 段階 5: ブック単位の一覧、ほかのページの箱を消す、ページの間の移動 ----

test("一覧はブック全体。表示中の箱に載っているページを添える", () => {
  const { graph } = setup(book());
  const items = graph.items();
  expect(items.live.map(i => [i.id, i.page, i.parent])).toEqual([
    ["1", null, null], ["2", null, null], ["3", "p1", null], ["4", "p1", null], ["5", "p1", "中B"], ["6", null, null],
  ]);
  expect(items.pages).toEqual([
    { id: null, caption: "最初のページ", current: true, pattern: "nest" },
    { id: "p1", caption: "詳細", current: false, pattern: "nest" },
  ]);
  graph.setPage("p1");
  expect(graph.items().pages.map(p => p.current)).toEqual([false, true]);
});

test("ほかのページの箱を消すと、子孫と中の線も消える。今のページの表示は変わらない", () => {
  const { el, graph } = setup(book());
  graph.remove(4);
  const out = graph.toJSON();
  expect(out.nodes.map(n => n.id)).toEqual([1, 2, 3, 6]);
  expect((out.removed ?? []).map(n => n.id)).toEqual([4, 5]);
  expect(edgeIds(out)).toEqual(["e1"]);
  expect(drawn(el)).toEqual(["1", "2", "6"]);
  graph.undo();
  expect(graph.toJSON().nodes.length).toBe(6);
});

test("ほかのページの箱を、今のページへ付け替えられる。階層が変わった線は外れる", () => {
  const notices: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, book(), { measureText: fakeMeasure, onEvent: ev => notices.push(noticeOf(ev)) });
  graphs.push(graph);
  // 最初のページを描いたまま、ページ p1 の 3 を最上位へ
  expect(graph.reparent(3, null, { x: 40, y: 400 })).toBe(true);
  const out = graph.toJSON();
  expect([node(out, 3).parent, node(out, 3).page]).toEqual([undefined, undefined]);
  expect(edgeIds(out)).toEqual(["e1"]);
  expect(drawn(el)).toContain("3");
  expect(notices.at(-1)).toContain("最初のページ");
});

test("付け替えのドラッグは、途中でページを切り替えても続き、落としたページへ移る", () => {
  const over: [number, number][] = [];
  let ended = 0;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, book(), {
    measureText: fakeMeasure, onLiftOver: (x, y) => over.push([x, y]), onLiftEnd: () => { ended++; },
  });
  graphs.push(graph);
  graph.setPage("p1");
  graph.setMode("reparent");
  const rect = HTMLElement.prototype.getBoundingClientRect;
  const doc = document as unknown as { elementsFromPoint?: (x: number, y: number) => Element[] };
  const was = doc.elementsFromPoint; // 終わったら元に戻す（setup.ts の代わりの関数）
  HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 700);
  doc.elementsFromPoint = () => []; // ポインタの下は空き（ワールド）
  try {
    const head = el.querySelector('.mz-node[data-id="3"] > .mz-head')!;
    const fire = (target: EventTarget, type: string, x: number) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 300, pointerId: 1 }));
    fire(head, "pointerdown", 100);
    fire(document, "pointermove", 150);
    expect(el.querySelector(".mz-ghost")).not.toBeNull();
    // アプリがタブの上で止まったのを見て、最初のページに切り替える
    graph.setPage(null);
    expect(graph.dragging()).toBe(true);
    expect(el.querySelector(".mz-ghost")).not.toBeNull();
    fire(document, "pointermove", 200);
    fire(document, "pointerup", 200);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = rect;
    doc.elementsFromPoint = was;
  }
  expect(over.length).toBe(2);
  expect(ended).toBe(1);
  expect(graph.dragging()).toBe(false);
  expect(el.querySelector(".mz-ghost")).toBeNull();
  expect([node(graph.toJSON(), 3).parent, node(graph.toJSON(), 3).page]).toEqual([undefined, undefined]);
  expect(drawn(el)).toContain("3");
});

// ---- 段階 6: ほかのブックからの移植（コピー） ----

test("copySubtree は箱を子孫ごと写し、線は写した箱どうしのものだけ", () => {
  const c = copySubtree(book(), 4);
  expect(c.root).toBe("4");
  expect(c.nodes.map(n => n.id)).toEqual([4, 5]);
  expect(c.edges).toEqual([]); // e2（3-4）は 3 を写さないので持っていかない
});

test("移植すると id と線の id を振り直し、親子と線を保つ。落としたページに載る（page は根にだけ書く）", () => {
  const { graph } = setup(book());
  graph.remove(6); // 消したものの id（6）も使わない
  // ほかのブックの 7（子 8、孫 9）を写す。このブックの 7〜9 とは別の箱
  const nodes: BoxData[] = [{ id: 7, caption: "外の箱" }, { id: 8, caption: "外の子", parent: 7 }, { id: 9, caption: "外の孫", parent: 8 }];
  const copy = { root: "7", nodes, edges: [] as EdgeData[] };
  const id = graph.paste(copy, null, { x: 40, y: 500 }, "other.json");
  const out = graph.toJSON();
  expect(id).toBe("7");
  expect(out.nodes.slice(-3).map(n => [n.id, n.parent, n.page])).toEqual([[7, undefined, undefined], [8, 7, undefined], [9, 8, undefined]]);
  graph.setPage("p1");
  const src = book();
  // 根 3 の子に 4・5 を並べた部分木（線 e2 は子どうし）。page は根にだけ書く
  const kid = (id: number) => ({ ...node(src, id), parent: 3, page: undefined });
  const id2 = graph.paste({ root: "3", nodes: [node(src, 3), kid(4), kid(5)], edges: [{ id: "e2", from: 4, to: 5 }] }, null, { x: 300, y: 500 });
  const out2 = graph.toJSON();
  expect(id2).toBe("10");
  expect(out2.nodes.slice(-3).map(n => [n.id, n.parent, n.page])).toEqual([[10, undefined, "p1"], [11, 10, undefined], [12, 10, undefined]]);
  expect(out2.edges!.at(-1)).toMatchObject({ from: 11, to: 12 });
  expect(new Set(edgeIds(out2)).size).toBe(edgeIds(out2).length);
  graph.undo();
  expect(graph.toJSON().nodes.length).toBe(out.nodes.length);
});

test("図の題名は、ページを見ているときに変えても、ブック全体の world に書く（ページの world には書かない）", () => {
  const { graph } = setup({ world: { route: "elbow" }, pages: [{ id: "p1", title: "P" }], nodes: [{ id: 2, page: "p1" }] });
  graph.update(null, { title: "題名" });
  expect(graph.toJSON().world).toEqual({ route: "elbow", title: "題名" });
  graph.setPage("p1");
  expect(graph.info(null)).toMatchObject({ kind: "world", title: "題名" });
  graph.update(null, { title: "  別の題名 " });
  const data = graph.toJSON();
  expect(data.world).toEqual({ route: "elbow", title: "別の題名" });
  expect(data.pages![0]!.world).toBeUndefined();
  graph.update(null, { title: "" });
  expect(graph.toJSON().world).toEqual({ route: "elbow" });
});

// サイドバーの一覧の色の印は、図で塗っている色（色の名前はテーマの色、color が無ければテーマの既定の色）
test("一覧の色の印は、色の名前とテーマを図と同じ決まりで塗る（読み込んだブックも、データだけのブックも）", () => {
  const sticky = themeById("sticky");
  const data: Diagram = {
    world: { theme: "sticky" },
    nodes: [
      { id: 1, caption: "社長", color: "primary" }, { id: 2, caption: "部", color: "#123456" }, { id: 3, caption: "無色" },
      { id: 4, caption: "枠" }, { id: 5, caption: "子", parent: 4 },
      { id: 6, caption: "標準の枠", theme: "default" }, { id: 7, caption: "子", parent: 6, color: "danger" },
    ],
  };
  const want = {
    "1": sticky.palette.primary, "2": "#123456", "3": sticky.box, "4": sticky.group ?? sticky.box, "5": sticky.box,
    "6": DEFAULTS.color, "7": themeById("default").palette.danger,
  };
  const paint = dataPaint(data, DEFAULTS.color);
  expect(Object.fromEntries(data.nodes.map(s => [String(s.id), paint(s)]))).toEqual(want);
  const { graph } = setup(data);
  expect(Object.fromEntries(graph.items().live.map(i => [i.id, i.color]))).toEqual(want);
});

// ---- D27 段階 5: パターンをまたぐ操作の禁止（docs/PATTERN-plan.md） ----

// 最初のページは内包、p1 はフローチャート（2 が載る）、p2 はツリー（根 3、子 4）
const patterned = (): Diagram => ({
  pages: [{ id: "p1", title: "流れ", world: { childView: "flow" } }, { id: "p2", title: "木", world: { childView: "tree", root: 3 } }],
  nodes: [
    { id: 1, caption: "内包の箱", x: 40, y: 40 },
    { id: 2, caption: "流れの箱", page: "p1", x: 40, y: 40 },
    { id: 3, caption: "根", page: "p2", x: 40, y: 40 }, { id: 4, caption: "葉", parent: 3 },
  ],
});

test("付け替え: パターンの違うページの箱は、今のページへ移せない（知らせる）。同じパターンのページどうしなら移せる", () => {
  const notices: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, patterned(), { measureText: fakeMeasure, onEvent: ev => notices.push(noticeOf(ev)) });
  graphs.push(graph);
  expect(graph.reparent(2, null, { x: 300, y: 40 })).toBe(false);
  expect(notices.at(-1)).toContain("フローチャート → 内包");
  expect(node(graph.toJSON(), 2).page).toBe("p1");
  expect(graph.reparent(4, null, { x: 300, y: 40 })).toBe(false);
  expect(notices.at(-1)).toContain("ツリー → 内包");
  // 同じパターン（内包）のページを足せば、そこへは移せる
  const p3 = graph.addPage({ title: "別の内包" });
  graph.setPage(p3);
  expect(graph.reparent(1, null, { x: 40, y: 40 })).toBe(true);
  expect(node(graph.toJSON(), 1).page).toBe(p3);
});

test("戻す・移植も同じ決まり。消したものの一覧には、載っていたページのパターンを添える", () => {
  const notices: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, patterned(), { measureText: fakeMeasure, onEvent: ev => notices.push(noticeOf(ev)) });
  graphs.push(graph);
  graph.remove(2); // フローチャートのページの箱を消す
  graph.remove(4); // ツリーの葉を消す（親 3 は残る）
  expect(graph.items().removed.map(i => [i.id, i.pattern])).toEqual([["2", "flow"], ["4", "tree"]]);
  expect(graph.items().pages.map(p => p.pattern)).toEqual(["nest", "flow", "tree"]);
  expect(graph.restore(2, null, { x: 300, y: 40 })).toBe(false);
  expect(notices.at(-1)).toContain("フローチャート → 内包");
  expect(graph.restore(4, null, { x: 300, y: 40 })).toBe(false);
  expect(graph.toJSON().removed?.length).toBe(2);
  graph.setPage("p1");
  expect(graph.restore(2, null, { x: 300, y: 40 })).toBe(true);
  // 移植: 写したものが載っていたページのパターン（copySubtree が添える）が違えば断る。無ければ内包として扱う
  const other = patterned();
  expect(copySubtree(other, 2).pattern).toBe("flow");
  expect(copySubtree(other, 4).pattern).toBe("tree");
  graph.setPage(null);
  expect(graph.paste(copySubtree(other, 2), null, { x: 300, y: 300 })).toBe("");
  expect(notices.at(-1)).toContain("フローチャート → 内包");
  expect(graph.paste(copySubtree(other, 1), null, { x: 300, y: 300 })).not.toBe("");
  expect(graph.paste({ root: "9", nodes: [{ id: 9, caption: "古い写し" }], edges: [] }, null, { x: 300, y: 500 })).not.toBe("");
});
