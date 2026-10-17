// validate.ts の検査のうち、箱どうしの関係を見る決まり（ページ・リンク・ツリーの根・消した箱・線の両端）を組み合わせで確かめる。
// 項目と値の決まり（表 WORLD_FIELDS など）は test/schema.test.ts が表から回す
import { describe, expect, test } from "bun:test";
import { assignIds, problems, validate } from "../web/src/validate";


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
    expect(withPages([{ id: 1, book: "" }])).toEqual([expect.stringContaining("book に使えるのは 空でない文字列 です: 1")]);
    expect(withPages([{ id: 1, book: "b", link: "p2" }])).toEqual(["book と link は一緒に書けません: 1"]);
    expect(withPages([{ id: 1, book: "b" }, { id: 2, parent: 1 }])).toEqual(["ブックの窓は子を持てません: 1"]);
  });
});

describe("ページ（pages）と箱の page", () => {
  test.each([
    [{ pages: {}, nodes: [] }, "pages に使えるのは 配列 です"],
    [{ pages: [{ title: "x" }], nodes: [] }, "pages に id の無いページがあります"],
    [{ pages: [{ id: "p2" }, { id: "p2" }], nodes: [] }, "ページの id が重複しています: p2"],
    [{ pages: [{ id: "p2", title: 1 }], nodes: [] }, "title に使えるのは 文字列 です: ページ p2"],
    [{ nodes: [{ id: 1, page: "p9" }] }, "存在しないページです: 1 → p9"],
    [{ nodes: [{ id: 1, page: false }] }, "page に使えるのは id（数か文字列） です: 1 (false)"],
    [{ nodes: [{ id: 1, world: {} }] }, "world は「箱」には書けません"],
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
    [{ nodes: [], removed: {} }, "removed に使えるのは 配列 です: ファイル ({})"],
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

describe("線", () => {
  test("線が配列でもオブジェクトでもなければ空の線。edges が配列でなければ誤り", () => {
    expect(problems({ nodes: [{ id: 1 }], edges: ["1-2", null] })).toEqual(["空の線があります", "空の線があります"]);
    expect(problems({ nodes: [], edges: {} })).toEqual(["edges に使えるのは 配列 です: ファイル ({})"]);
  });
  test("fromMember / toMember はクラスの箱の端の、ある属性・操作の名前だけ", () => {
    const cls = { id: 1, shape: "class", attrs: [{ name: "id" }], ops: [{ name: "save" }] };
    const run = (e: object, a: object = cls) => problems({ nodes: [a, { id: 2 }], edges: [{ from: 1, to: 2, ...e }] });
    expect(run({ fromMember: "id" })).toEqual([]);
    expect(run({ fromMember: "save" })).toEqual([]);
    expect(run({ fromMember: "nope" })[0]).toContain("fromMember の属性・操作がありません");
    expect(run({ fromMember: 1 })[0]).toContain("fromMember に使えるのは");
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
  expect(got).toContain("removed に使えるのは 配列 です: ファイル (x)");
  expect(got).toContain("pages に使えるのは 配列 です: ファイル (3)");
  expect(got).toContain("world に使えるのは オブジェクト です: ファイル (1)");
  expect(got).toContain("存在しないノードへの線があります: 1 - 9");
  expect(() => validate(broken)).toThrow(got[0]!);
});
