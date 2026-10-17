import { describe, expect, test } from "bun:test";
import { assignIds, problems, validate, formatOf } from "../web/src/validate";

describe("validate", () => {
  test("正しいデータは通る", () => {
    expect(() => validate({
      world: { route: "elbow" },
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
    [{ nodes: [{ id: 1, size: "XL" }] }, "size に使えるのは L / M / S です: 1 (XL)"],
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
    "size に使えるのは L / M / S です: 1 (XL)",
    "id が重複しています: 1",
    "存在しない親です: 2 → 9",
    "存在しないノードへの線があります: 1 - 3",
    "exitAt に使えるのは 0 から 1 の数 です: 1 - 2 (2)",
    "階層の違うボックス同士の線があります: 1 - 2",
  ]);
  expect(() => validate(data)).toThrow("size に使えるのは L / M / S です: 1 (XL)");
  expect(problems({ nodes: [{ id: 1 }] })).toEqual([]);
});

test("problems は親子の循環があっても止まる", () => {
  expect(problems({ nodes: [{ id: 1, parent: 2, page: "p9" }, { id: 2, parent: 1, page: "p9" }] }))
    .toEqual([
      "親子関係が循環しています: 1", "親子関係が循環しています: 2",
      "存在しないページです: 1 → p9", "存在しないページです: 2 → p9",
    ]);
});


test("ファイルの形式: マスターのパターンはマスター用のファイルの最初のページにだけ書け、窓（book）はどちらのファイルにも書ける（D26・D29）", () => {
  expect(formatOf({ world: { childView: "master" } })).toBe("master");
  expect(formatOf({ world: { childView: "tree" } })).toBe("book");
  expect(formatOf({})).toBe("book");
  // マスター用のファイル: 窓を書け、2 枚目からのページは持てない。窓は子を持てない
  expect(problems({ world: { childView: "master" }, nodes: [{ id: 1, book: "abc" }] })).toEqual([]);
  expect(problems({ world: { childView: "master" }, pages: [{ id: "p1" }], nodes: [] })[0]).toContain("2 枚目からのページを持てません");
  expect(problems({ world: { childView: "master" }, nodes: [{ id: 1, book: "abc" }, { id: 2, parent: 1 }] })[0]).toContain("ブックの窓は子を持てません");
  expect(problems({ world: { childView: "master" }, nodes: [{ id: 1, book: 3 }] })[0]).toContain("book に使えるのは 空でない文字列");
  // ふつうのブック: ブックへの窓（ブックリンク）も書ける（D29）。ページにマスターのパターンは書けない
  expect(problems({ nodes: [{ id: 1, book: "abc" }] })).toEqual([]);
  expect(problems({ pages: [{ id: "p1", world: { childView: "master" } }], nodes: [] })[0]).toContain("ページには書けません");
});

