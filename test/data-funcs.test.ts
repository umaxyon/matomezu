// データだけを見る関数を、図を描かずに確かめる: pages.ts（ページの判定・写し）、data-scene.ts（描いていないページの縮図）、
// tree-flatten.ts の applyFlatten（平らにした形をデータに書く所）、unseen.ts（見ていない LLM の変更をいつ認知するか）
import { describe, expect, test } from "bun:test";
import { EMPTY_SCENE, dataScene } from "../web/src/data-scene";
import { DEFAULTS } from "../web/src/graph";
import type { Op } from "../web/src/history";
import type { Box } from "../web/src/model";
import { copySubtree, liveItems, pageMembers, pageNameOf, pageOf, pageWorld, patternOf, removedPageOf, subtreeIds } from "../web/src/pages";
import { applyFlatten, type FlattenPlan } from "../web/src/tree-flatten";
import { createUnseen } from "../web/src/unseen";
import type { BoxData, Diagram } from "../web/src/types";
import { problems } from "../web/src/validate";
import { STEPS as SIZES } from "../web/src/size-rules";

describe("pages.ts", () => {
  test("pageOf: 親子が循環していても止まる。無い id は最初のページ", () => {
    const nodes: BoxData[] = [{ id: 1, parent: 2, page: "p2" }, { id: 2, parent: 1 }];
    expect(["p2", null]).toContain(pageOf(nodes, 1));
    expect(pageOf(nodes, 99)).toBeNull();
  });

  test("ページの id は数で書いても文字列のページとして扱う", () => {
    const d: Diagram = { pages: [{ id: 2 as unknown as string, world: { childView: "flow" } }], nodes: [{ id: 1, page: 2 as unknown as string }, { id: 3, parent: 1 }] };
    expect(pageOf(d.nodes, 3)).toBe("2");
    expect(pageMembers(d.nodes, "2")).toEqual(["1", "3"]);
    expect(patternOf(d, "2")).toBe("flow");
  });

  test("patternOf / pageWorld: 無いページ・パターンでない値は内包、world の無いページは空", () => {
    const d: Diagram = { world: { childView: "list" as never }, pages: [{ id: "p2" }, { id: "p3", world: { childView: "tree", root: 1 } }], nodes: [] };
    expect([patternOf(d, null), patternOf(d, "p2"), patternOf(d, "p3"), patternOf(d, "p9")]).toEqual(["nest", "nest", "tree", "nest"]);
    expect([pageWorld(d, "p2"), pageWorld(d, "p9"), pageWorld({ nodes: [] }, null)]).toEqual([{}, {}, {}]);
  });

  test("pageNameOf: 題名は前後の空白を落とし、空白だけなら id の名前", () => {
    const d: Diagram = { pages: [{ id: "p2", title: "  詳細 " }, { id: "p3", title: "   " }], nodes: [] };
    expect([pageNameOf(d, "p2"), pageNameOf(d, "p3")]).toEqual(["詳細", "p3_(空)"]);
  });

  test("removedPageOf: 消した箱は親をたどる（親は消した箱でも、まだある箱でもよい）", () => {
    const d: Diagram = {
      pages: [{ id: "p2" }],
      nodes: [{ id: 1, page: "p2" }],
      removed: [{ id: 2, parent: 1 }, { id: 3, parent: 2 }, { id: 4, page: "p2" }, { id: 5 }, { id: 6, parent: 99 }],
    };
    expect([2, 3, 4, 5, 6].map(id => removedPageOf(d, id))).toEqual(["p2", "p2", "p2", null, null]);
  });

  test("subtreeIds は子孫を全部集める（データの並び順に関わらず）", () => {
    const nodes: BoxData[] = [{ id: 3, parent: 2 }, { id: 2, parent: 1 }, { id: 1 }, { id: 4 }];
    expect([...subtreeIds(nodes, 1)].sort()).toEqual(["1", "2", "3"]);
    expect([...subtreeIds(nodes, 4)]).toEqual(["4"]);
  });

  test("copySubtree: 写しは元とデータを共有せず、配列の線は { from, to } に直す。パターンは載っていたページのもの", () => {
    const d: Diagram = {
      pages: [{ id: "p2", world: { childView: "flow" } }],
      nodes: [{ id: 1, page: "p2", style: { color: "red" } } as BoxData, { id: 2, page: "p2" }],
      edges: [[1, 1], [1, 2]],
    };
    const c = copySubtree(d, 1);
    expect(c).toEqual({ root: "1", nodes: [{ id: 1, page: "p2", style: { color: "red" } } as BoxData], edges: [{ from: 1, to: 1 }], pattern: "flow" });
    (c.nodes[0] as unknown as { style: { color: string } }).style.color = "blue";
    expect((d.nodes[0] as unknown as { style: { color: string } }).style.color).toBe("red");
  });

  test("liveItems: ページの一覧は最初のページから並び、current がどれでもなければどれも表示中にしない", () => {
    const d: Diagram = { pages: [{ id: "p2", world: { childView: "tree", root: 2 } }], nodes: [{ id: 1, caption: "親" }, { id: 3, parent: 1 }, { id: 2, page: "p2" }] };
    const r = liveItems(d, undefined, () => "");
    expect(r.pages.map(p => [p.id, p.current, p.pattern])).toEqual([[null, false, "nest"], ["p2", false, "tree"]]);
    expect(liveItems(d, null, () => "").pages.map(p => p.current)).toEqual([true, false]);
    expect(r.live.map(i => [i.id, i.parent, i.page])).toEqual([["1", null, null], ["3", "親", null], ["2", null, "p2"]]);
  });
});

describe("dataScene（描いていないページの縮図の近似）", () => {
  const opt = { treeGapX: DEFAULTS.treeGapX, treeGapY: DEFAULTS.treeGapY, padding: DEFAULTS.padding };
  test("そのページの最上位だけを、データの位置と大きさ（無ければ M の最小）で置く。線は最上位どうしで自分への線は除く", () => {
    const d: Diagram = {
      pages: [{ id: "p2", world: { background: "#eee" } }],
      nodes: [
        { id: 1, page: "p2", x: 10, y: 20, color: "#f00" }, { id: 2, page: "p2", x: 300, width: 50, height: 30, color: "red" },
        { id: 3, parent: 1 }, { id: 4 },
      ],
      edges: [[1, 2], [1, 1], [3, 3], [1, 4]],
    };
    const s = dataScene(d, "p2", opt);
    expect(s.boxes).toEqual([
      { x: 10, y: 20, w: SIZES.M.minW, h: SIZES.M.h, color: "#f00", outline: true },
      { x: 300, y: 0, w: 50, h: 30, color: null, outline: false },
    ]);
    expect(s.edges).toEqual([{ points: [[10 + SIZES.M.minW / 2, 20 + SIZES.M.h / 2], [325, 15]] }]);
    expect([s.w, s.h, s.bg]).toEqual([350, 20 + SIZES.M.h, "#eee"]);
    // 最初のページは ""。箱が無ければ 1×1
    expect(dataScene(d, "", opt).boxes.length).toBe(1);
    expect(dataScene({ nodes: [] }, "", opt)).toEqual({ ...EMPTY_SCENE });
  });

  // 根 1 の下に子 2 と 3。向きごとに、子が根のどちら側に並ぶか
  test.each([
    ["down", (r: Rect, k: Rect) => k.y >= r.y + r.h + opt.treeGapY],
    ["up", (r: Rect, k: Rect) => k.y + k.h + opt.treeGapY <= r.y],
    ["right", (r: Rect, k: Rect) => k.x >= r.x + r.w + opt.treeGapY],
    ["left", (r: Rect, k: Rect) => k.x + k.w + opt.treeGapY <= r.x],
  ] as const)("ツリーのページ（%s）: 根の子孫を木に組み、木の枠の左上を根のデータの位置 + 余白にそろえる", (dir, beyond) => {
    const d: Diagram = {
      pages: [{ id: "p2", world: { childView: "tree", root: 1, treeDirection: dir } }],
      nodes: [{ id: 1, page: "p2", x: 100, y: 50 }, { id: 2, parent: 1 }, { id: 3, parent: 1 }, { id: 4, page: "p2", x: 0, y: 0 }],
    };
    expect(problems(d)).toEqual([]);
    const s = dataScene(d, "p2", opt);
    expect(s.boxes.length).toBe(4);
    const [root, a, b] = s.boxes as Rect[];
    expect([a, b].every(k => beyond(root!, k!))).toBe(true);
    expect(Math.min(...[root!, a!, b!].map(r => r.x))).toBe(100 + opt.padding);
    expect(Math.min(...[root!, a!, b!].map(r => r.y))).toBe(50 + opt.padding);
    expect(s.edges.length).toBe(2 + 2); // 親から半分・横の棒・子へ 2 本
    expect(s.boxes.every(x => !x.outline)).toBe(true);
  });

  test("ツリーのページでも根が無ければ、最上位を置くだけ", () => {
    const d: Diagram = { pages: [{ id: "p2", world: { childView: "tree" } }], nodes: [{ id: 1, page: "p2" }, { id: 2, parent: 1 }] };
    expect(dataScene(d, "p2", opt).boxes).toEqual([{ x: 0, y: 0, w: SIZES.M.minW, h: SIZES.M.h, color: null, outline: true }]);
  });
});
type Rect = { x: number; y: number; w: number; h: number };

test("applyFlatten: 平らにした木はページの最上位へ並び、線を足し、ページのパターンを内包に戻す（ほかのページは変えない）", () => {
  const d: Diagram = {
    pages: [{ id: "p2", world: { childView: "tree", root: 1, treeDirection: "left", background: "#fff" } }, { id: "p3", world: { childView: "tree", root: 9 } }],
    nodes: [{ id: 1, page: "p2", childView: "list" }, { id: 2, parent: 1, childView: "hidden" }, { id: 3, parent: 2 }, { id: 5, page: "p2" }, { id: 9, page: "p3" }],
    edges: [{ id: "e1", from: 5, to: 1, exitAt: 0.3, via: [10] }, [5, 5]],
  };
  const sub = ["1", "2", "3"].map(id => ({ id }) as unknown as Box);
  const plan: FlattenPlan = {
    subtree: sub,
    head: new Map([["1", { x: 0.4, y: 0, w: 1, h: 1 }], ["2", { x: 10, y: 20.6, w: 1, h: 1 }], ["3", { x: 30, y: 40, w: 1, h: 1 }]]),
    links: [{ id: "e2", from: 1, to: 2 }, { id: "e3", from: 2, to: 3 }],
    rerouted: new Map([["e1", { exitAt: null, enterAt: 0.5, via: null }]]),
  };
  applyFlatten(d, plan, "p2");
  expect(d.nodes.slice(0, 3)).toEqual([{ id: 1, page: "p2", x: 0, y: 0 }, { id: 2, page: "p2", x: 10, y: 21 }, { id: 3, page: "p2", x: 30, y: 40 }]);
  expect(d.edges).toEqual([{ id: "e1", from: 5, to: 1, enterAt: 0.5 }, [5, 5], { id: "e2", from: 1, to: 2 }, { id: "e3", from: 2, to: 3 }]);
  expect(d.pages![0]!.world).toEqual({ background: "#fff" });
  expect(d.pages![1]!.world).toEqual({ childView: "tree", root: 9 });
  expect(problems(d)).toEqual([]);
});

test("applyFlatten: 最初のページなら page を書かない（中の箱が持っていた page も消す）", () => {
  const d: Diagram = { world: { childView: "tree", root: 1 }, nodes: [{ id: 1 }, { id: 2, parent: 1 }] };
  applyFlatten(d, { subtree: [{ id: "1" }, { id: "2" }] as unknown as Box[], head: new Map([["1", { x: 0, y: 0, w: 1, h: 1 }], ["2", { x: 5, y: 5, w: 1, h: 1 }]]), links: [], rerouted: new Map() }, null);
  expect(d).toEqual({ world: {}, nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 5 }], edges: [] });
});

describe("unseen（見ていない LLM の変更の認知）", () => {
  // 見えている入れ物（大きさの判定は使わない変更だけを扱う: ページの設定・最上位の項目・描いていない箱）
  function setup(page: string | null = null) {
    const container = document.createElement("div");
    container.getClientRects = () => [{}] as unknown as DOMRectList;
    const adopted: Op[] = [], seen: string[] = [];
    let alive = true;
    const U = createUnseen({
      container, worldEl: document.createElement("div"), page: () => page, boxById: () => undefined, zoom: () => 1,
      alive: () => alive, adopt: op => adopted.push(op), seen: v => seen.push(v),
    });
    return { U, adopted, seen, kill: () => { alive = false; } };
  }
  const op = (changes: Op["changes"]): Op => ({ at: 1, changes });
  const pageChange = (key: string) => op([{ kind: "page", key, op: "change", fields: ["title"] }]);
  const worldChange = op([{ kind: "world", key: "", op: "change", fields: ["title"] }]);
  const topChange = op([{ kind: "top", key: "", op: "change", fields: ["v"] }]);
  const nodeChange = op([{ kind: "node", key: "1", op: "change", fields: ["caption"] }]);

  test("最上位の項目の変更はすぐ認知し、版の印（W/ と引用符）を落として知らせる", () => {
    const { U, adopted, seen } = setup();
    U.add(topChange, 'W/"abc"', null);
    U.check();
    expect([adopted.length, seen, U.any()]).toEqual([1, ["abc"], false]);
  });

  test("ページの設定の変更は、そのページを見ているときだけ（world は最初のページ）", () => {
    const first = setup(null);
    first.U.add(pageChange("p2"), undefined, null);
    first.U.add(worldChange, undefined, null);
    first.U.check();
    expect([first.adopted, first.U.any()]).toEqual([[worldChange], true]);
    const p2 = setup("p2");
    p2.U.add(pageChange("p2"), "v1", null);
    p2.U.check();
    expect([p2.adopted.length, p2.seen]).toEqual([1, ["v1"]]);
  });

  test("描いていない箱の変更は認知しない。図を壊したあとは何も認知しない。clear で忘れる", () => {
    const s = setup();
    s.U.add(nodeChange, undefined, null);
    s.U.check();
    expect([s.adopted.length, s.U.any()]).toEqual([0, true]);
    s.U.clear();
    expect(s.U.any()).toBe(false);
    s.U.add(topChange, undefined, null);
    s.kill();
    s.U.check();
    expect([s.adopted.length, s.U.any()]).toEqual([0, true]);
  });

  test("隠れている入れ物（裏のブック）では認知しない", () => {
    const hidden = document.createElement("div");
    hidden.getClientRects = () => [] as unknown as DOMRectList;
    const adopted: Op[] = [];
    const U = createUnseen({
      container: hidden, worldEl: hidden, page: () => null, boxById: () => undefined, zoom: () => 1,
      alive: () => true, adopt: o => adopted.push(o), seen: () => {},
    });
    U.add(topChange, undefined, null);
    U.check();
    expect(adopted).toEqual([]);
  });
});
