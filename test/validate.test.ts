import { describe, expect, test } from "bun:test";
import { assignIds, problems, validate } from "../web/src/validate";

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

test("treeDirection の値を検証する", () => {
  expect(() => validate({ nodes: [{ id: 1, treeDirection: "left" }] })).not.toThrow();
  expect(() => validate({ nodes: [{ id: 1, treeDirection: "diagonal" }] })).toThrow("treeDirection の値が不正です");
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
      "ページの中の箱はページにできません: 1（2 のページの中）", "ページの中の箱はページにできません: 2（1 のページの中）",
    ]);
});

test("world の title は文字列だけ", () => {
  expect(problems({ world: { title: 3 }, nodes: [] })).toEqual(["world の title は文字列にしてください"]);
  expect(problems({ world: { title: "題名" }, nodes: [] })).toEqual([]);
});
