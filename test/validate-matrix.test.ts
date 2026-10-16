// validate.ts の検査を、項目ごとの値の境目と、ページ・リンク・ツリーの根・消した箱の組み合わせで確かめる。
// validate.test.ts は代表の誤りを見る。ここは「通る値と通らない値の境目」と「場所ごとの決まり」を表で回す
import { describe, expect, test } from "bun:test";
import { PAGE_PATTERNS, PAPER_NAMES, assignIds, problems, validate } from "../web/src/validate";
import { THEMES } from "../web/src/theme";

// 箱 1 つに項目を足したデータの誤り
const boxProblems = (fields: Record<string, unknown>) => problems({ nodes: [{ id: 1, caption: "a", ...fields }] });
// ページの world に項目を足したデータの誤り（最初のページと、2 枚目のページの両方で同じ結果になること）
const worldProblems = (fields: Record<string, unknown>) => {
  const first = problems({ world: fields, nodes: [] });
  const second = problems({ pages: [{ id: "p2", world: fields }], nodes: [] });
  expect(second.length).toBe(first.length);
  return first;
};

describe("箱の設定の値の境目（通る値 / 通らない値と、誤りの文に入る言葉）", () => {
  test.each([
    ["width", [1, 0.5, 400], [0, -1, "10", Number.NaN], "width は正の数"],
    ["bodyWidth", [1, 200], [0, -5, "1"], "bodyWidth は正の数"],
    ["bodyLines", [1, 3], [0, 1.5, -1, "2"], "bodyLines は 1 以上の整数"],
    ["listHeight", [1, 300], [0, -1, "100"], "listHeight"],
    ["size", ["L", "M", "S"], ["XL", "m", 1], "size の値が不正"],
    ["kidSize", ["L", "M", "S"], ["XS"], "kidSize の値が不正"],
    ["rowSize", ["L", "M", "S"], ["XL"], "rowSize に使えるのは"],
    ["overflow", ["wrap", "grow", "clip"], ["scroll"], "overflow の値が不正"],
    ["previewSide", ["right", "left", "none"], ["top", true], "previewSide に使えるのは"],
    ["linkLook", ["window", "side"], ["frame"], "linkLook に使えるのは"],
    ["userAdded", [true, false], ["true", 1], "userAdded は true か false"],
    ["bodyRule", [true, false], ["no", 0], "bodyRule は true か false"],
    ["body", ["", "本文"], [3, ["a"]], "body は文字列"],
    ["clip", [{ x: 0, y: 0, w: 1, h: 1 }], [{ x: 0, y: 0, w: 0, h: 1 }, { x: 0, y: 0, w: 1 }, [0, 0, 1, 1]], "clip は { x, y, w, h }"],
    ["childView", ["nest", "list", "hidden"], ["preview", "bogus"], "childView の値が不正"],
    ["childView", [], ["flow", "master"], "world.childView に書きます"],
    ["childView", [], ["tree"], "world.root に根の箱の id"],
    ["treeDirection", [], ["down", "left"], "箱には書けません"],
  ] as [string, unknown[], unknown[], string][])("%s", (key, ok, ng, message) => {
    for (const v of ok) expect([v, boxProblems({ [key]: v })]).toEqual([v, []]);
    for (const v of ng) {
      const got = boxProblems({ [key]: v });
      expect([v, got.length]).toEqual([v, 1]);
      expect(got[0]).toContain(message);
    }
  });

  test("theme: 表のテーマは通る。知らない名前は problems では誤り、画面で開く validate では誤りにしない（標準として描く）", () => {
    for (const th of THEMES) expect(boxProblems({ theme: th.id })).toEqual([]);
    expect(boxProblems({ theme: "nothing" })[0]).toContain("theme の値が不正");
    expect(() => validate({ nodes: [{ id: 1, theme: "nothing" }] })).not.toThrow();
    expect(() => validate({ world: { theme: "nothing" }, nodes: [] })).not.toThrow();
  });
});

describe("ページ（world）の設定の値の境目。最初のページと 2 枚目からのページで同じ", () => {
  test("childView はページのパターンだけ。箱の見せ方は書けない", () => {
    for (const p of PAGE_PATTERNS.filter(p => p !== "master" && p !== "tree")) expect(worldProblems({ childView: p })).toEqual([]);
    for (const v of ["list", "hidden", "preview", "bogus"]) expect(worldProblems({ childView: v })[0]).toContain("world の childView に使えるのは");
  });
  test("paper は紙の型の表の名前だけ", () => {
    for (const p of PAPER_NAMES) expect(worldProblems({ paper: p })).toEqual([]);
    for (const v of ["b5", "A4-landscape", 1]) expect(worldProblems({ paper: v })[0]).toContain("paper（紙の型）の値が不正");
  });
  test("treeDirection・route・overflow: grow", () => {
    for (const d of ["down", "up", "left", "right"]) expect(worldProblems({ treeDirection: d })).toEqual([]);
    expect(worldProblems({ treeDirection: "diagonal" })[0]).toContain("treeDirection の値が不正");
    for (const r of ["straight", "elbow"]) expect(worldProblems({ route: r })).toEqual([]);
    expect(worldProblems({ route: "curve" })[0]).toContain("route の値が不正");
    expect(worldProblems({ overflow: "grow" })[0]).toContain("overflow: grow は使えません");
  });
  test("world とページの world がオブジェクトでなければ誤り", () => {
    expect(problems({ world: [], nodes: [] })).toEqual(["world がオブジェクトではありません"]);
    expect(problems({ pages: [{ id: "p2", world: "x" }], nodes: [] })[0]).toContain("world がオブジェクトではありません: p2");
  });
});

describe("ページのパターン × 置く場所（最初のページと 2 枚目のページ）", () => {
  // そのページに、子を持つ最上位の箱を 2 つ（1 と 3）置く。ツリーなら 1 を根にする
  const book = (pattern: string, onPage: boolean) => {
    const world = { childView: pattern, ...(pattern === "tree" ? { root: 1 } : {}) };
    const page = onPage ? { page: "p2" } : {};
    return {
      ...(onPage ? { pages: [{ id: "p2", world }] } : { world }),
      nodes: [{ id: 1, ...page }, { id: 2, parent: 1 }, { id: 3, ...page }, { id: 4, parent: 3 }],
    };
  };
  test.each([
    ["nest", false, []], ["nest", true, []],
    ["tree", false, ["ツリーのページで子を持てるのは根（world.root）の子孫だけです: 4 → 3"]],
    ["tree", true, ["ツリーのページで子を持てるのは根（world.root）の子孫だけです: 4 → 3"]],
    ["flow", false, ["フローチャートの中の箱は子を持てません: 2 → 1", "フローチャートの中の箱は子を持てません: 4 → 3"]],
    ["flow", true, ["フローチャートの中の箱は子を持てません: 2 → 1", "フローチャートの中の箱は子を持てません: 4 → 3"]],
    ["master", false, []],
  ] as [string, boolean, string[]][])("%s（2 枚目のページ: %p）", (pattern, onPage, want) => {
    expect(problems(book(pattern, onPage))).toEqual(want);
  });

  test("マスターのパターンは 2 枚目からのページに書けない", () => {
    expect(problems(book("master", true))[0]).toContain("ページには書けません（マスター用のファイルの最初のページだけ）: p2");
  });

  test("パターンの決まりは、そのページに載る箱にだけ効く（ほかのページの箱は自分のページの決まり）", () => {
    const data = {
      world: { childView: "flow" },
      pages: [{ id: "p2" }],
      nodes: [{ id: 1 }, { id: 3, page: "p2" }, { id: 4, parent: 3 }],
    };
    expect(problems(data)).toEqual([]);
  });

  test("ツリーの根: 無い・中の箱を指す・ほかのページの箱を指す・リンクの箱は誤り", () => {
    const tree = (root: unknown, extra: object[] = []) => problems({
      pages: [{ id: "p2", world: { childView: "tree", ...(root === undefined ? {} : { root }) } }, { id: "p3" }],
      nodes: [{ id: 1, page: "p2" }, { id: 2, parent: 1 }, { id: 3, page: "p3" }, ...extra],
    });
    expect(tree(1)).toEqual([]);
    expect(tree("1")).toEqual([]); // id は文字列でも数でも同じ箱
    for (const bad of [undefined, 99, 2, 3]) expect(tree(bad)).toContain("ツリーのページには根が要ります（world.root に、そのページの最上位の箱の id）: p2");
    expect(tree(5, [{ id: 5, page: "p2", link: "p3" }])).toContain("ツリーの根はリンクの箱にできません: 5");
  });
});

describe("リンクの箱（link）とブックの窓（book）", () => {
  const withPages = (nodes: object[]) => problems({ pages: [{ id: "p2" }], nodes });
  test("link は存在するページの id で、自分の載っているページ以外。子を持てない", () => {
    expect(withPages([{ id: 1, link: "p2" }])).toEqual([]);
    expect(withPages([{ id: 1, link: "p9" }])).toEqual(["存在しないページへのリンクです: 1 → p9"]);
    expect(withPages([{ id: 1, page: "p2", link: "p2" }])).toEqual(["自分の載っているページへはリンクできません: 1"]);
    expect(withPages([{ id: 1 }, { id: 2, parent: 1, link: "p2" }])).toEqual([]); // 中の箱でもよい（最初のページに載る）
    expect(withPages([{ id: 1, page: "p2" }, { id: 2, parent: 1, link: "p2" }])).toEqual(["自分の載っているページへはリンクできません: 2"]);
    expect(withPages([{ id: 1, link: "p2" }, { id: 2, parent: 1 }])).toEqual(["リンクの箱は子を持てません: 1"]);
  });
  test("縮図を出さない見せ方（icon）は、空白でないキャプションが要る（link でも book でも）", () => {
    expect(withPages([{ id: 1, link: "p2", linkLook: "icon", caption: "先" }])).toEqual([]);
    for (const caption of [undefined, "", "  "]) {
      expect(withPages([{ id: 1, link: "p2", linkLook: "icon", caption }])).toEqual(["縮図を出さないリンクの箱には、キャプションを書いてください: 1"]);
      expect(withPages([{ id: 1, book: "b", linkLook: "icon", caption }])).toEqual(["縮図を出さないリンクの箱には、キャプションを書いてください: 1"]);
    }
    expect(withPages([{ id: 1, link: "p2", linkLook: "side" }])).toEqual([]); // 縮図を出す見せ方はキャプションが無くてよい
  });
  test("book は空でない文字列。link と一緒に書けず、子を持てない", () => {
    expect(withPages([{ id: 1, book: "" }])).toEqual(["book はブックの id の文字列にしてください: 1"]);
    expect(withPages([{ id: 1, book: "b", link: "p2" }])).toEqual(["book と link は一緒に書けません: 1"]);
    expect(withPages([{ id: 1, book: "b" }, { id: 2, parent: 1 }])).toEqual(["ブックの窓は子を持てません: 1"]);
  });
});

describe("ページ（pages）と箱の page", () => {
  test.each([
    [{ pages: {}, nodes: [] }, "pages が配列ではありません"],
    [{ pages: [{ title: "x" }], nodes: [] }, "pages に id の無いページがあります"],
    [{ pages: [{ id: "p2" }, { id: "p2" }], nodes: [] }, "ページの id が重複しています: p2"],
    [{ pages: [{ id: "p2", title: 1 }], nodes: [] }, "ページの title は文字列にしてください: p2"],
    [{ nodes: [{ id: 1, page: "p9" }] }, "存在しないページです: 1 → p9"],
    [{ nodes: [{ id: 1, page: false }] }, "page: true はもう使えません"],
    [{ nodes: [{ id: 1, world: {} }] }, "箱に world は書けません"],
    [{ pages: [{ id: "p2" }], nodes: [{ id: 1, page: "p2" }, { id: 2, parent: 1, page: "p2" }] }, "page は最上位の箱にだけ書けます"],
  ])("誤り %#", (data, message) => {
    const got = problems(data);
    expect(got.length).toBe(1);
    expect(got[0]).toContain(message);
  });

  test("ページの違う最上位どうしの線は誤り。同じページの最上位どうしなら通る（id は数でも文字列でも同じページ）", () => {
    const base = { pages: [{ id: "p2" }], nodes: [{ id: 1, page: "p2" }, { id: 2, page: "p2" }, { id: 3 }] };
    expect(problems({ ...base, edges: [[1, 2]] })).toEqual([]);
    expect(problems({ ...base, edges: [[1, 3]] })[0]).toContain("ページの違うボックス同士の線があります");
  });
});

describe("消した箱（removed）", () => {
  test.each([
    [{ nodes: [], removed: {} }, "removed が配列ではありません"],
    [{ nodes: [], removed: [{ caption: "x" }] }, "removed に空のノードがあります"],
    [{ nodes: [{ id: 1 }], removed: [{ id: 1 }] }, "id が重複しています: 1"],
    [{ nodes: [], removed: [{ id: 2 }, { id: "2" }] }, "id が重複しています: 2"],
  ])("誤り %#", (data, message) => {
    expect(problems(data)).toEqual([message]);
  });
  test("消した箱の parent は、消した箱でも、もう無い id でもよい。消した箱へ線は引けない", () => {
    expect(problems({ nodes: [{ id: 1 }], removed: [{ id: 2, parent: 3 }, { id: 3, parent: 99 }] })).toEqual([]);
    expect(problems({ nodes: [{ id: 1 }], removed: [{ id: 2 }], edges: [[1, 2]] })).toEqual(["存在しないノードへの線があります: 1 - 2"]);
  });
  test("assignIds は消した箱の id も使用済みとして数える", () => {
    const data = { nodes: [{ id: 1 }, { caption: "新" }] as Record<string, unknown>[], removed: [{ id: 5 }] };
    assignIds(data);
    expect(data.nodes[1]!.id).toBe(6);
  });
});

describe("線の項目の値の境目", () => {
  const edgeProblems = (fields: Record<string, unknown>) =>
    problems({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, ...fields }] });
  test.each([
    ["captionAt", [0, 0.5, 1], [-0.01, 1.01, "0.5"], "captionAt は 0 から 1"],
    ["exitAt", [0, 1], [-1, 2], "exitAt は 0 から 1"],
    ["enterAt", [0, 1], [1.5], "enterAt は 0 から 1"],
    ["bend", [0.01, 0.5, 0.99], [0, 1, -0.5], "bend は 0 より大きく 1 より小さい"],
    ["captionOffset", [0, -12.5, 30], [Infinity, Number.NaN, "3"], "captionOffset は数"],
    ["caption", ["", "はい"], [1], "線の caption は文字列"],
    ["via", [[], [10], [1, 2, 3]], [[1, "2"], [Number.NaN], 5], "via は数の並び"],
    ["arrow", ["start", "end", "both"], ["none"], "arrow の値が不正"],
    ["dash", ["solid", "dashed"], ["dotted"], "dash の値が不正"],
    ["route", ["straight", "elbow"], ["curve"], "route の値が不正"],
    ["exit", ["horizontal", "vertical"], ["up"], "exit の値が不正"],
    ["startHead", [], ["bogus"], "startHead の値が不正"],
  ] as [string, unknown[], unknown[], string][])("%s", (key, ok, ng, message) => {
    for (const v of ok) expect([v, edgeProblems({ [key]: v })]).toEqual([v, []]);
    for (const v of ng) {
      const got = edgeProblems({ [key]: v });
      expect([v, got.length]).toEqual([v, 1]);
      expect(got[0]).toContain(message);
    }
  });
  test("線が配列でもオブジェクトでもなければ空の線。edges が配列でなければ誤り", () => {
    expect(problems({ nodes: [{ id: 1 }], edges: ["1-2", null] })).toEqual(["空の線があります", "空の線があります"]);
    expect(problems({ nodes: [], edges: {} })).toEqual(["edges が配列ではありません"]);
  });
  test("fromMember / toMember はクラスの箱の端の、ある属性・操作の名前だけ", () => {
    const cls = { id: 1, shape: "class", attrs: [{ name: "id" }], ops: [{ name: "save" }] };
    const run = (e: object, a: object = cls) => problems({ nodes: [a, { id: 2 }], edges: [{ from: 1, to: 2, ...e }] });
    expect(run({ fromMember: "id" })).toEqual([]);
    expect(run({ fromMember: "save" })).toEqual([]);
    expect(run({ fromMember: "nope" })[0]).toContain("fromMember の属性・操作がありません");
    expect(run({ fromMember: 1 })[0]).toContain("fromMember は属性か操作の名前");
    expect(run({ toMember: "id" })[0]).toContain("toMember はクラスの箱の端にだけ書けます");
    expect(run({ fromMember: "id" }, { id: 1 })[0]).toContain("fromMember はクラスの箱の端にだけ書けます");
  });
});

test("クラスの箱は子を持てない。属性・操作の名前は通して重ねられない", () => {
  expect(problems({ nodes: [{ id: 1, shape: "class" }, { id: 2, parent: 1 }] })).toEqual(["クラスの箱は子を持てません: 2 → 1"]);
  expect(problems({ nodes: [{ id: 1, shape: "class", attrs: [{ name: "x" }], ops: [{ name: "x" }] }] }))
    .toEqual(["属性・操作の名前が重なっています: 1 の x"]);
});

test("validate は最初の誤りで止まり、problems はデータの形が崩れていても止まらずに挙げる", () => {
  const broken = { world: 1, nodes: [null, { id: 1, parent: 1 }], removed: "x", pages: 3, edges: [[1, 9]] };
  const got = problems(broken);
  expect(got).toContain("空のノードがあります");
  expect(got).toContain("親子関係が循環しています: 1");
  expect(got).toContain("removed が配列ではありません");
  expect(got).toContain("pages が配列ではありません");
  expect(got).toContain("存在しないノードへの線があります: 1 - 9");
  expect(() => validate(broken)).toThrow(got[0]!);
});
