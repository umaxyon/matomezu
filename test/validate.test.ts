import { describe, expect, test } from "bun:test";
import { assignIds, problems, validate, formatOf } from "../web/src/validate";

describe("validate", () => {
  test("正しいデータは通る", () => {
    expect(() => validate({
      world: { overflow: "clip" },
      nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3, parent: 1 }],
      edges: [{ id: "e1", from: 2, to: 3 }, [2, 3]],
    })).not.toThrow();
  });

  test("自分に戻る線は通る（docs/SELFLOOP-plan.md）", () => {
    expect(() => validate({ nodes: [{ id: 1 }], edges: [[1, 1]] })).not.toThrow();
  });

  test.each([
    [{}, "nodes 配列がありません"],
    [{ nodes: [{ id: 1 }, { id: 1 }] }, "id が重複しています: 1"],
    [{ nodes: [{ id: 1, parent: 5 }] }, "存在しない親です: 1 → 5"],
    [{ nodes: [{ id: 1, parent: 2 }, { id: 2, parent: 1 }] }, "親子関係が循環しています: 1"],
    [{ nodes: [{ id: 1, size: "XL" }] }, "size の値が不正です: 1 (XL)"],
    [{ nodes: [], world: { overflow: "grow" } }, "world に overflow: grow は使えません"],
    [{ nodes: [{ id: 1 }, { id: 2, parent: 1 }], edges: [[1, 2]] }, "階層の違うボックス同士の線があります: 1 - 2"],
    [{ nodes: [{ id: 1 }, { id: 2 }], edges: [{ id: "e1", from: 1, to: 2 }, { id: "e1", from: 2, to: 1 }] }, "線の id が重複しています: e1"],
  ])("不正なデータ %#", (data, message) => {
    expect(() => validate(data)).toThrow(message);
  });
});

test("assignIds は既存の数値 id の続きから振る", () => {
  const data = { nodes: [{ caption: "a" }, { id: 7 }, { caption: "b" }] as Record<string, unknown>[] };
  assignIds(data);
  expect(data.nodes.map(n => n.id)).toEqual([8, 7, 9]);
});

test("shape の値を検証する", () => {
  expect(() => validate({ nodes: [{ id: 1, shape: "person" }, { id: 2, shape: "db" }] })).not.toThrow();
  expect(() => validate({ nodes: [{ id: 1, shape: "cloud" }] })).toThrow("shape の値が不正です: 1 (cloud)");
});

test("world の background は文字列", () => {
  expect(() => validate({ world: { background: "#fff" }, nodes: [] })).not.toThrow();
  expect(() => validate({ world: { background: 123 }, nodes: [] })).toThrow("background");
});

test("treeDirection はページの world に書く。値を検証し、箱に書いたら誤り", () => {
  expect(() => validate({ world: { treeDirection: "left" }, nodes: [] })).not.toThrow();
  expect(() => validate({ world: { treeDirection: "diagonal" }, nodes: [] })).toThrow("treeDirection の値が不正です");
  expect(() => validate({ nodes: [{ id: 1, treeDirection: "left" }] })).toThrow("箱には書けません");
});

test("箱に tree を書くと、world.childView と world.root に書く直し方を案内する（flow は world.childView だけ）", () => {
  expect(() => validate({ nodes: [{ id: 1, childView: "tree" }] })).toThrow("world.root に根の箱の id");
  expect(() => validate({ nodes: [{ id: 1, childView: "flow" }] })).toThrow("world.childView に書きます");
});

test("ページの違う箱どうしの線は誤り。関連はリンクの箱へ線を引く、と案内する", () => {
  const book = (edges: [number, number][]) => ({
    pages: [{ id: "p2" }], nodes: [{ id: 1 }, { id: 2, page: "p2" }, { id: 3, page: "p2" }, { id: 4, link: "p2" }], edges,
  });
  expect(() => validate(book([[1, 2]]))).toThrow("リンクの箱（link）");
  expect(() => validate(book([[2, 3], [1, 4]]))).not.toThrow();
});

test("problems は誤りを全部挙げる（validate は最初の 1 つで止める）", () => {
  const data = {
    nodes: [{ id: 1, size: "XL" }, { id: 2, parent: 9 }, { id: 1 }],
    edges: [{ from: 1, to: 3 }, { from: 1, to: 2, exitAt: 2 }],
  };
  expect(problems(data)).toEqual([
    "size の値が不正です: 1 (XL)",
    "id が重複しています: 1",
    "存在しない親です: 2 → 9",
    "存在しないノードへの線があります: 1 - 3",
    "exitAt は 0 から 1 の数にしてください: 1 - 2 (2)",
    "階層の違うボックス同士の線があります: 1 - 2",
  ]);
  expect(() => validate(data)).toThrow("size の値が不正です: 1 (XL)");
  expect(problems({ nodes: [{ id: 1 }] })).toEqual([]);
});

test("problems は親子の循環があっても止まる", () => {
  expect(problems({ nodes: [{ id: 1, parent: 2, page: true }, { id: 2, parent: 1, page: true }] }))
    .toEqual([
      "親子関係が循環しています: 1", "親子関係が循環しています: 2",
      "page: true はもう使えません（ページは pages に書き、載せる箱に page: ページの id を書きます）: 1",
      "page: true はもう使えません（ページは pages に書き、載せる箱に page: ページの id を書きます）: 2",
    ]);
});

test("world の title は文字列だけ", () => {
  expect(problems({ world: { title: 3 }, nodes: [] })).toEqual(["world の title は文字列にしてください"]);
  expect(problems({ world: { title: "題名" }, nodes: [] })).toEqual([]);
});

test("ファイルの形式: マスターのパターンはマスター用のファイルの最初のページにだけ書け、窓（book）はマスター用のファイルにだけ書ける（D26）", () => {
  expect(formatOf({ world: { childView: "master" } })).toBe("master");
  expect(formatOf({ world: { childView: "tree" } })).toBe("book");
  expect(formatOf({})).toBe("book");
  // マスター用のファイル: 窓を書け、2 枚目からのページは持てない。窓は子を持てない
  expect(problems({ world: { childView: "master" }, nodes: [{ id: 1, book: "abc" }] })).toEqual([]);
  expect(problems({ world: { childView: "master" }, pages: [{ id: "p1" }], nodes: [] })[0]).toContain("2 枚目からのページを持てません");
  expect(problems({ world: { childView: "master" }, nodes: [{ id: 1, book: "abc" }, { id: 2, parent: 1 }] })[0]).toContain("ブックの窓は子を持てません");
  expect(problems({ world: { childView: "master" }, nodes: [{ id: 1, book: 3 }] })[0]).toContain("book はブックの id の文字列");
  // ふつうのブック: 窓は書けず、ページにマスターのパターンは書けない
  expect(problems({ nodes: [{ id: 1, book: "abc" }] })[0]).toContain("マスター用のファイルにだけ書けます");
  expect(problems({ pages: [{ id: "p1", world: { childView: "master" } }], nodes: [] })[0]).toContain("ページには書けません");
});
