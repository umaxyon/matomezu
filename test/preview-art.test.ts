// 縮図の絵（preview-art.ts）のテスト
import { expect, test } from "bun:test";
import { sceneOf } from "../web/src/preview-art";
import type { Geometry } from "../web/src/report";

const box = (id: string, y: number, h: number, extra = {}) =>
  ({ id, caption: id, ancestors: [], x: 10, y, w: 100, h, cut: false, color: "#ff0000", fill: true, border: true, ...extra });

test("スクロールしているリストの中の箱は、リストの枠で切って描く（一部だけ見えている行がはみ出さない。D33）", () => {
  const g = {
    viewport: { w: 500, h: 500 }, paper: null, outside: [], treeLines: [], edges: [],
    boxes: [
      box("L", 0, 100, { scroll: { shown: 2, total: 5 }, kids: 5, view: "list" }),
      box("a", 30, 40, { ancestors: ["L"] }),
      box("b", 80, 40, { ancestors: ["L"] }), // 下の 20 は見えていない
    ],
  } as unknown as Geometry;
  const s = sceneOf(g, null);
  expect(s.boxes.map(b => [b.y, b.h])).toEqual([[0, 100], [30, 40], [80, 20]]);
});
