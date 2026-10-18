// 縮図の絵（preview-art.ts）のテスト
import { expect, test } from "bun:test";
import { createGraph } from "../web/src/graph";
import { minimapView } from "../web/src/minimap";
import { sceneItems, sceneOf } from "../web/src/preview-art";
import { themeById } from "../web/src/theme";
import { fakeMeasure } from "./helpers";
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

test("ミニマップでも、塗らない箱は枠だけ、塗らず枠も無い箱（見出しの文字だけの箱）は描かない", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, {
    nodes: [
      { id: 1, caption: "見出しだけ", fill: false, border: false, x: 40, y: 20 },
      { id: 2, caption: "枠だけ", fill: false, border: true, x: 40, y: 120 },
      ...Array.from({ length: 10 }, (_, i) => ({ id: i + 3, caption: `箱 ${i + 3}`, x: 40 + (i % 2) * 300, y: 220 + Math.floor(i / 2) * 80 })),
    ],
  }, { measureText: fakeMeasure });
  try {
    // ミニマップ（minimap.ts）と同じ描き方: 配置の結果から絵のもとを作り、要素にする
    const items = sceneItems(sceneOf(graph.geometry(), null));
    expect(items.filter(x => x.getAttribute("class") === "mm-box")).toHaveLength(10); // 塗る箱だけ
    expect(items.filter(x => x.getAttribute("class") === "mm-group")).toHaveLength(1); // 枠だけの箱（見出しだけの箱は描かない）
  } finally {
    graph.destroy();
    document.body.innerHTML = "";
  }
});

test("ミニマップの背景は、テーマの背景（付箋紙など）も塗る。world.background があればそちら（リンクの箱の窓と同じ）", () => {
  const bgOf = (world: Record<string, unknown>) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const graph = createGraph(el, { world, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] } as never, { measureText: fakeMeasure });
    const view = minimapView(el, graph, { width: 160, maxHeight: () => 400 });
    view.draw();
    const fill = view.el.querySelector<SVGElement>(".mm-bg")?.style.fill;
    view.destroy();
    graph.destroy();
    el.remove();
    return fill;
  };
  expect(bgOf({ theme: "sticky" })).toBe(themeById("sticky").background!);
  expect(bgOf({ theme: "sticky", background: "#1e1e1e" })).toBe("#1e1e1e");
});
