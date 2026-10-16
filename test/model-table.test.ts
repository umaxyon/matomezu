// model.ts の戦略の表を引く関数（arrangeOf / placedBy / strategyOf / abilitiesOf / lookOf / worldViewOf / acceptsKid）を、
// 図を描かずに確かめる。箱は親子と src だけを持つ写し（判定は DOM を読まない）。
// ページのパターン × 箱の見せ方 × 置かれる場所の組み合わせで、CLAUDE.md の「並べ方の戦略」の決まりどおりに引けるかを見る
import { describe, expect, test } from "bun:test";
import {
  type Box, type World, STRATEGIES, abilitiesOf, acceptsKid, arrangeOf, hidesKids, inList, inTree, isHidden, lookOf, placedBy,
  placesFreely, strategyOf, worldViewOf,
} from "../web/src/model";
import { BOX_VIEWS, PAGE_FORMATS, PAGE_PATTERNS, PATTERN_LABELS, VIEWS, problems } from "../web/src/validate";
import type { BoxData, ChildView, WorldData } from "../web/src/types";

type Spec = { id: string; parent?: string } & Partial<BoxData>;
// ワールドと箱の写しを組む。箱は並び順に親の children に入る
function build(world: WorldData, specs: Spec[]) {
  const w = { isWorld: true, id: null, src: world, children: [] as Box[] } as unknown as World;
  const byId = new Map<string, Box>();
  for (const { id, parent, ...src } of specs) {
    byId.set(id, { isWorld: false, world: w, id, src: { id, ...src }, parent: null, children: [] } as unknown as Box);
  }
  for (const { id, parent } of specs) {
    const n = byId.get(id)!;
    if (parent == null) (w.children as Box[]).push(n);
    else { n.parent = byId.get(parent)!; n.parent.children.push(n); }
  }
  return { w, box: (id: string) => byId.get(id)! };
}

describe("表どうしの対応（validate.ts は DOM の無い CLI でも動くので、戦略の表を読まずに名前で持つ）", () => {
  const keys = (pred: (s: (typeof STRATEGIES)[ChildView]) => boolean) =>
    (Object.keys(STRATEGIES) as ChildView[]).filter(k => pred(STRATEGIES[k])).sort() as string[];

  test("PAGE_PATTERNS は onWorld、BOX_VIEWS は onBox、VIEWS は戦略の全部と同じ名前", () => {
    expect([...PAGE_PATTERNS as readonly string[]].sort()).toEqual(keys(s => s.onWorld));
    expect([...BOX_VIEWS as readonly string[]].sort()).toEqual(keys(s => s.onBox));
    expect([...VIEWS as readonly string[]].sort()).toEqual(keys(() => true));
    expect(Object.keys(PAGE_FORMATS).sort()).toEqual([...PAGE_PATTERNS].sort());
    expect(Object.keys(PATTERN_LABELS).sort()).toEqual([...PAGE_PATTERNS].sort());
  });

  // ページに掛けた戦略の leafKids・rootOnly と、validate の検査（名前で見ている）が同じ結論になる
  test.each(PAGE_PATTERNS.map(p => [p]))("%s のページ: 子を持てる箱の決まりが、戦略の表と検査で一致する", p => {
    const s = STRATEGIES[p];
    // 1 は根（ツリーなら world.root）、3 は根でない最上位。どちらも子を持つ
    const world: WorldData = { childView: p, ...(s.rootOnly || s.descendants ? { root: 1 } : {}) };
    const msgs = problems({ world, nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3 }, { id: 4, parent: 3 }] });
    const refused = [2, 4].filter(id => msgs.some(m => m.includes(`: ${id} → `)));
    expect(refused).toEqual(s.leafKids ? [2, 4] : s.rootOnly ? [4] : []);
  });
});

describe("worldViewOf: ページに掛けられる戦略だけ。ほかは内包", () => {
  test.each([
    [undefined, "nest"], ["nest", "nest"], ["tree", "tree"], ["flow", "flow"], ["master", "master"],
    ["list", "nest"], ["hidden", "nest"], ["preview", "nest"], ["bogus", "nest"], [3, "nest"],
  ])("world.childView %p → %p", (v, want) => {
    expect(worldViewOf(build({ childView: v } as WorldData, []).w)).toBe(want as never);
  });
});

describe("arrangeOf: 箱が子をどう並べるか", () => {
  test("子が無ければ、見せ方を書いていても葉（leaf）。strategyOf は null", () => {
    for (const v of [undefined, ...BOX_VIEWS]) {
      const { box } = build({}, [{ id: "1", childView: v }]);
      expect(arrangeOf(box("1"))).toBe("leaf");
      expect(strategyOf(box("1"))).toBeNull();
    }
  });

  // 箱に書いた childView のうち、箱に書けるもの（onBox）だけが効く。ページのパターン・縮図の名前は内包として扱う
  test.each([
    [undefined, "nest"], ["nest", "nest"], ["list", "list"], ["hidden", "hidden"],
    ["tree", "nest"], ["flow", "nest"], ["master", "nest"], ["preview", "nest"], ["bogus", "nest"],
  ])("内包のページの最上位の箱 childView %p → %p", (v, want) => {
    const { box } = build({}, [{ id: "1", childView: v as BoxData["childView"] }, { id: "2", parent: "1" }]);
    expect(arrangeOf(box("1"))).toBe(want as ChildView);
    expect(strategyOf(box("1"))).toBe(STRATEGIES[want as ChildView]);
  });

  // リストの子で子を持つものは縮図。非表示にしたものと、縮図を出さないリスト（none）の中は非表示
  test.each([
    [undefined, undefined, "preview"], ["nest", "left", "preview"], ["list", "right", "preview"],
    ["hidden", "right", "hidden"], ["nest", "none", "hidden"], ["list", "none", "hidden"],
  ])("リストの子 childView %p・リストの previewSide %p → %p", (own, side, want) => {
    const { box } = build({}, [
      { id: "L", childView: "list", previewSide: side as BoxData["previewSide"] },
      { id: "c", parent: "L", childView: own as BoxData["childView"] }, { id: "g", parent: "c" },
    ]);
    expect(arrangeOf(box("c"))).toBe(want as ChildView);
    expect(hidesKids(box("c"))).toBe(true);
    expect(isHidden(box("g"))).toBe(true);
  });

  test("内包・非表示の箱の中の箱は、自分の見せ方のまま（縮図は並べる側がリストのときだけ）", () => {
    for (const outer of ["nest", "hidden"] as const) {
      const { box } = build({}, [{ id: "o", childView: outer }, { id: "c", parent: "o", childView: "list" }, { id: "g", parent: "c" }]);
      expect(arrangeOf(box("c"))).toBe("list");
    }
  });

  test("ツリーのページ: 根と根の子孫（子を持つもの）は自分の見せ方に関わらずツリー。根でない最上位は自分の見せ方", () => {
    const { box } = build({ childView: "tree", root: "r" }, [
      { id: "r", childView: "list" }, { id: "a", parent: "r", childView: "hidden" }, { id: "b", parent: "a" },
      { id: "x", childView: "list" }, { id: "y", parent: "x" },
    ]);
    expect([arrangeOf(box("r")), arrangeOf(box("a")), arrangeOf(box("b"))]).toEqual(["tree", "tree", "leaf"]);
    expect(isHidden(box("b"))).toBe(false); // ツリーの中の非表示は無視する
    expect(arrangeOf(box("x"))).toBe("list");
  });

  test("ツリーのページでも world.root が無ければ、どの箱もツリーにしない", () => {
    const { box } = build({ childView: "tree" }, [{ id: "r" }, { id: "a", parent: "r" }]);
    expect(arrangeOf(box("r"))).toBe("nest");
    expect(inTree(box("a"))).toBe(false);
  });
});

describe("placedBy: 箱を並べている親の並べ方。最上位はページのパターンの tops", () => {
  test.each([
    ["nest", "nest"], ["tree", "nest"], ["flow", "flow"], ["master", "nest"], [undefined, "nest"],
  ])("%p のページの最上位 → %p", (p, want) => {
    const { box } = build({ childView: p as WorldData["childView"], root: "1" }, [{ id: "1" }, { id: "2" }]);
    expect(placedBy(box("2"))).toBe(want as ChildView);
  });

  test("中の箱は親の arrangeOf（リスト・非表示・ツリー・縮図）", () => {
    const { box } = build({ childView: "tree", root: "r" }, [
      { id: "r" }, { id: "t", parent: "r" },
      { id: "L", childView: "list" }, { id: "li", parent: "L" }, { id: "lg", parent: "li" },
      { id: "H", childView: "hidden" }, { id: "hi", parent: "H" },
    ]);
    expect(placedBy(box("t"))).toBe("tree");
    expect(placedBy(box("li"))).toBe("list");
    expect(placedBy(box("lg"))).toBe("preview");
    expect(placedBy(box("hi"))).toBe("hidden");
    expect([inList(box("li")), inList(box("L")), inTree(box("t")), inTree(box("r"))]).toEqual([true, false, true, false]);
  });
});

describe("abilitiesOf: 箱にできる操作は、置かれた戦略から決まる", () => {
  const ab = (world: WorldData, specs: Spec[], id: string) => {
    const { box } = build(world, specs);
    const a = abilitiesOf(box(id));
    return [a.drag, a.reorder, a.link, a.widthGrip, a.heightGrip, a.dropInto];
  };
  //                                                     drag   reorder link   width  height dropInto
  test.each([
    ["内包のページの最上位", {}, [{ id: "1" }], "1",               [true, false, true, false, false, true]],
    ["内包の箱の子", {}, [{ id: "p" }, { id: "1", parent: "p" }], "1", [true, false, true, false, false, true]],
    ["リストの子", {}, [{ id: "L", childView: "list" }, { id: "1", parent: "L" }], "1", [false, true, false, false, false, true]],
    ["子を持つリスト", {}, [{ id: "1", childView: "list" }, { id: "c", parent: "1" }], "1", [true, false, true, true, false, true]],
    ["高さの上限を持つリスト", {}, [{ id: "1", childView: "list", listHeight: 200 }, { id: "c", parent: "1" }], "1", [true, false, true, true, true, true]],
    ["子の無いリスト（上限があってもつまみは出ない）", {}, [{ id: "1", childView: "list", listHeight: 200 }], "1", [true, false, true, false, false, true]],
    ["上限 0 のリスト", {}, [{ id: "1", childView: "list", listHeight: 0 }, { id: "c", parent: "1" }], "1", [true, false, true, true, false, true]],
    ["非表示の箱の子", {}, [{ id: "H", childView: "hidden" }, { id: "1", parent: "H" }], "1", [false, false, true, false, false, true]],
    ["ツリーの根", { childView: "tree", root: "1" }, [{ id: "1" }, { id: "c", parent: "1" }], "1", [true, false, true, false, false, true]],
    ["ツリーの子", { childView: "tree", root: "r" }, [{ id: "r" }, { id: "1", parent: "r" }], "1", [false, false, false, false, false, true]],
    ["フローチャートの最上位", { childView: "flow" }, [{ id: "1" }], "1", [true, false, true, false, false, false]],
    ["マスターの最上位", { childView: "master" }, [{ id: "1" }], "1", [true, false, true, false, false, true]],
    ["リンクの箱", {}, [{ id: "1", link: "p2" }], "1", [true, false, true, false, false, false]],
    ["ブックの窓", { childView: "master" }, [{ id: "1", book: "b1" }], "1", [true, false, true, false, false, false]],
    ["クラスの箱", {}, [{ id: "1", shape: "class" }], "1", [true, false, true, false, false, false]],
  ] as [string, WorldData, Spec[], string, boolean[]][])("%s", (_, world, specs, id, want) => {
    expect(ab(world, specs, id)).toEqual(want);
  });
});

describe("lookOf: 並べられたときの見せ方は、並べられる箱の側の決まり（形の表の placed を重ねる）", () => {
  const look = (world: WorldData, specs: Spec[], id: string) => {
    const l = lookOf(build(world, specs).box(id));
    return [l.plainShape, l.sharedSize, l.fullCaption, l.preview];
  };
  test("リストの子は形とサイズを使わず、キャプションを切らず、縮図を横に出す", () => {
    expect(look({}, [{ id: "L", childView: "list" }, { id: "1", parent: "L", shape: "diamond", size: "S" }], "1")).toEqual([true, true, true, true]);
  });
  test("フローチャートの最上位はキャプションを切らないだけ", () => {
    expect(look({ childView: "flow" }, [{ id: "1", shape: "diamond", size: "S" }], "1")).toEqual([false, false, true, false]);
  });
  test("内包・マスター・ツリーのページの最上位は、そのまま", () => {
    for (const p of ["nest", "master", "tree"] as const) {
      expect(look({ childView: p, root: "1" }, [{ id: "1", shape: "parallelogram" }], "1")).toEqual([false, false, false, false]);
    }
  });
  test("平行四辺形と台形はツリーの中ではボックスで見せる（形のローカルなルール）。ほかの形と、ツリーの外では形のまま", () => {
    const inTreeLook = (shape: BoxData["shape"]) =>
      look({ childView: "tree", root: "r" }, [{ id: "r" }, { id: "1", parent: "r", shape }], "1")[0];
    expect(["parallelogram", "parallelogramAlt", "trapezoid", "trapezoidAlt"].map(s => inTreeLook(s as BoxData["shape"]))).toEqual([true, true, true, true]);
    expect(["box", "diamond", "hexagon", "circle"].map(s => inTreeLook(s as BoxData["shape"]))).toEqual([false, false, false, false]);
    expect(look({}, [{ id: "p" }, { id: "1", parent: "p", shape: "parallelogram" }], "1")[0]).toBe(false);
  });
});

describe("acceptsKid: 入れ物に子を入れられるか（子を持つ箱か × 入れ物の場所）", () => {
  type Row = [string, WorldData, Spec[], string | null, boolean, boolean];
  test.each([
    // 名前, ワールド, 箱, 入れ物（null はワールド）, 子の無い箱を入れられるか, 子を持つ箱を入れられるか
    ["内包のワールド", {}, [], null, true, true],
    ["内包の箱", {}, [{ id: "p" }], "p", true, true],
    ["リスト", {}, [{ id: "p", childView: "list" }], "p", true, true],
    ["非表示の箱", {}, [{ id: "p", childView: "hidden" }], "p", true, true],
    ["リンクの箱", {}, [{ id: "p", link: "p2" }], "p", false, false],
    ["フローチャートのワールド", { childView: "flow" }, [], null, true, false],
    ["フローチャートの要素", { childView: "flow" }, [{ id: "p" }], "p", false, false],
    ["ツリーのワールド（根の外の最上位）", { childView: "tree", root: "r" }, [{ id: "r" }], null, true, false],
    ["ツリーの根", { childView: "tree", root: "r" }, [{ id: "r" }], "r", true, true],
    ["ツリーの根の子孫", { childView: "tree", root: "r" }, [{ id: "r" }, { id: "p", parent: "r" }], "p", true, true],
    ["ツリーの根でない最上位", { childView: "tree", root: "r" }, [{ id: "r" }, { id: "p" }], "p", false, false],
    ["マスターのワールド", { childView: "master" }, [], null, true, true],
  ] as Row[])("%s", (_, world, specs, at, leaf, branch) => {
    const { w, box } = build(world, specs);
    const p = at == null ? w : box(at);
    expect([acceptsKid(p, false), acceptsKid(p, true)]).toEqual([leaf, branch]);
  });
});

test("placesFreely: 自分の見せ方が自由に置くものなら、子が無くても自由に置く。ツリーの中の箱は自由に置かない", () => {
  const { box } = build({ childView: "tree", root: "r" }, [
    { id: "a" }, { id: "L", childView: "list" }, { id: "H", childView: "hidden" }, { id: "r" }, { id: "t", parent: "r" },
  ]);
  expect(["a", "L", "H", "r", "t"].map(id => placesFreely(box(id)))).toEqual([true, false, false, true, false]);
});
