import { describe, expect, test } from "bun:test";
import { formatDiagram } from "../web/src/format";

const data = {
  world: { width: 800, background: "#fff" },
  nodes: [
    { id: 1, caption: "フロントエンド", x: 40, y: 60, body: "1 行目\n\"引用\"" },
    { id: 2, caption: "Web", parent: 1, via: [[1, 2], [3, 4]], style: {} },
  ],
  edges: [],
  pages: [{ id: "p1", nodes: [1] }],
};

// cmd/matomezu の formatDiagram（TestFormatDiagram）と同じ文字列
const expected = `{
  "world": { "width": 800, "background": "#fff" },
  "nodes": [
    { "id": 1, "caption": "フロントエンド", "x": 40, "y": 60, "body": "1 行目\\n\\"引用\\"" },
    { "id": 2, "caption": "Web", "parent": 1, "via": [[1, 2], [3, 4]], "style": {} }
  ],
  "edges": [],
  "pages": [
    { "id": "p1", "nodes": [1] }
  ]
}
`;

describe("formatDiagram", () => {
  test("最上位のキーを 1 行ずつ、配列は要素 1 つを 1 行に書く", () => {
    expect(formatDiagram(data)).toBe(expected);
  });

  test("読み戻すと元のデータと同じ。undefined の値は書かない", () => {
    expect(JSON.parse(formatDiagram(data))).toEqual(data);
    expect(formatDiagram({ nodes: [{ id: 1, caption: "A", x: undefined }] })).toBe(`{\n  "nodes": [\n    { "id": 1, "caption": "A" }\n  ]\n}\n`);
    expect(formatDiagram({})).toBe("{}\n");
  });
});

describe("formatDiagram の値の形ごとの書き方", () => {
  test("空の配列と空のオブジェクトは 1 行（[] と {}）。中身のある入れ子は区切りの後ろと {} の内側に空白", () => {
    expect(formatDiagram({ nodes: [], world: {}, edges: [{ id: "e1", from: 1, to: 2, via: [] }] })).toBe(
      `{\n  "nodes": [],\n  "world": {},\n  "edges": [\n    { "id": "e1", "from": 1, "to": 2, "via": [] }\n  ]\n}\n`);
  });
  test("配列の中の undefined と関数は null（JSON.stringify と同じ）。オブジェクトの中では項目ごと書かない", () => {
    const data = { edges: [[1, undefined, () => 0]], world: { f: () => 0, a: 1 } };
    expect(formatDiagram(data)).toBe(`{\n  "edges": [\n    [1, null, null]\n  ],\n  "world": { "a": 1 }\n}\n`);
    expect(JSON.parse(formatDiagram(data))).toEqual(JSON.parse(JSON.stringify(data)));
  });
  test("最上位がオブジェクトでなければ 1 行で書く", () => {
    expect(formatDiagram([1, { a: 2 }])).toBe(`[1, { "a": 2 }]\n`);
    expect(formatDiagram(null)).toBe("null\n");
    expect(formatDiagram("x")).toBe(`"x"\n`);
  });
  test("キーと文字列はエスケープし、読み戻すと元と同じ（記号・改行・制御文字・絵文字）。中の改行で行は分かれない", () => {
    const data = { nodes: [{ id: 1, caption: "a\tb\u0001\"\\ 🐱", "k\"ey": "\n" }], pages: [{ id: "p " }] };
    expect(JSON.parse(formatDiagram(data))).toEqual(data);
    expect(formatDiagram(data).split("\n").length).toBe(9);
  });
});
