// 数値は 1 か所で変えられ、変えればそれを使う所が全部ついてくる（2026-10-12 ユーザー）。
// 全世界の間隔・戦略の間隔・テーマの補正値・形の数値を、1 つずつその置き場所で変えて、大きさ・位置・CSS・線がそれに従うことを確かめる。
// ほかの所に同じ数値を書き写していれば、ここが失敗する（CSS も、数値ではなく変数で読んでいることを最後に確かめる）
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createGraph, type Graph, type GraphOptions } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
import { SHAPE_DEFS } from "../web/src/shapes";
import { THEMES } from "../web/src/theme";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});
const setup = (data: Diagram, o: GraphOptions = {}) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure, ...o });
  graphs.push(graph);
  return { el, graph };
};
const info = (g: Graph, id: number) => g.info(id) as BoxInfo;
const head = (el: HTMLElement, id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head`)!;
// 表の値を一時的に変えて fn を走らせ、元に戻す
function withValue<T extends object, K extends keyof T>(obj: T, key: K, value: T[K], fn: () => void) {
  const was = obj[key];
  obj[key] = value;
  try { fn(); } finally { obj[key] = was; }
}

test("全世界の間隔（gap・linkGap・captionGap）は DEFAULTS の値だけで決まる", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, caption: "上", x: 100, y: 100 }, { id: 2, caption: "下", x: 100, y: 110 },
      { id: 3, caption: "上", x: 400, y: 100 }, { id: 4, caption: "下", x: 400, y: 110 },
      { id: 5, caption: "上", x: 700, y: 100 }, { id: 6, caption: "下", x: 700, y: 110 },
    ],
    edges: [{ id: "e1", from: 3, to: 4 }, { id: "e2", from: 5, to: 6, caption: "はい" }],
  }, { gap: 15, linkGap: 50, captionGap: 70 });
  const gap = (a: number, b: number) => info(graph, b).y - (info(graph, a).y + info(graph, a).h);
  expect([gap(1, 2), gap(3, 4), gap(5, 6)]).toEqual([15, 50, 70]);
});

test("戦略のローカルな間隔（リストの kidGap）は、戦略の表の値だけで決まる", () => {
  withValue(STRATEGIES.list, "kidGap", 20, () => {
    const { graph } = setup({ nodes: [{ id: 1, childView: "list", x: 0, y: 0 }, { id: 2, parent: 1, caption: "a" }, { id: 3, parent: 1, caption: "b" }] });
    expect(info(graph, 3).y - (info(graph, 2).y + info(graph, 2).h)).toBe(20);
  });
});

test("フローチャートの整列の間隔は、戦略の表（align）の値だけで決まる", () => {
  const align = STRATEGIES.flow.align!;
  withValue(align.gaps, "M", { x: 100, y: 100 }, () => {
    const { graph } = setup({
      nodes: [{ id: 1, childView: "flow", x: 0, y: 0 }, { id: 2, parent: 1, caption: "a" }, { id: 3, parent: 1, caption: "b" }],
      edges: [{ id: "e1", from: 2, to: 3 }],
    });
    expect(info(graph, 3).y - (info(graph, 2).y + info(graph, 2).h)).toBe(100);
  });
});

test("テーマの補正値は、テーマの outset の値だけで決まり、中心は動かない", () => {
  const sticky = THEMES.find(t => t.id === "sticky")!;
  withValue(sticky, "outset", { M: [10, 6] }, () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "箱", x: 100, y: 100 }] });
    const before = info(graph, 1);
    graph.update(null, { theme: "sticky" });
    const after = info(graph, 1);
    expect([after.w - before.w, after.h - before.h]).toEqual([12, 20]);
    expect([after.x + after.w / 2, after.y + after.h / 2]).toEqual([before.x + before.w / 2, before.y + before.h / 2]);
  });
});

test("斜めの辺の食い込みは、形の表（slant）の値だけで決まる（輪郭・文字の余白の CSS 変数・線がつながる範囲）", () => {
  withValue(SHAPE_DEFS.parallelogram, "slant", { L: 30, M: 30, S: 30 }, () => {
    const { el, graph } = setup({
      nodes: [
        { id: 1, childView: "flow", x: 0, y: 0 },
        { id: 2, parent: 1, caption: "入力", shape: "parallelogram", x: 300, y: 40 }, { id: 3, parent: 1, caption: "左", x: 20, y: 40 },
      ],
      edges: [{ id: "e1", from: 3, to: 2 }],
    });
    expect(head(el, 2).style.getPropertyValue("--mz-slant")).toBe("30px");
    expect(el.querySelector(`.mz-node[data-id="2"] .mz-outline-body`)!.getAttribute("d")).toStartWith("M31,");
    // 線は左の辺の真ん中（本体の左端から食い込みの半分）につながる
    const end = el.querySelector('.mz-edge[data-id="e1"] polyline')!.getAttribute("points")!.trim().split(/\s+/).at(-1)!;
    const p = info(graph, 1), b = info(graph, 2);
    expect(Number(end.split(",")[0])).toBe(p.x + b.x + 15);
  });
});

test("文字を中に収める形（ひし形）の割合は、形の表（fit）の値だけで決まる（大きさと CSS 変数）", () => {
  const data: Diagram = { nodes: [{ id: 1, caption: "分岐", shape: "diamond", x: 40, y: 40 }] };
  const w = () => { const { graph } = setup(data); return info(graph, 1).w; };
  const base = w();
  withValue(SHAPE_DEFS.diamond, "fit", { ratio: 0.25, pad: 12, wrap: 0.6 }, () => {
    const { el, graph } = setup(data);
    expect(info(graph, 1).w).toBeGreaterThan(base);
    expect(head(el, 1).style.getPropertyValue("--mz-text-ratio")).toBe("0.25");
  });
});

test("CSS は形の数値を書き写さず、render.ts が渡す変数で読む", () => {
  const css = readFileSync(`${import.meta.dir}/../web/src/graph-style.ts`, "utf8");
  // 斜めの辺の余白と、文字を折り返す幅の割合
  expect(css).toContain("var(--mz-slant");
  expect(css).toContain("var(--mz-text-ratio");
  expect(css).not.toMatch(/\+ 14px|max-width: 50%|max-width: 70%/);
});
