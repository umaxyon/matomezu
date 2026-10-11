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
