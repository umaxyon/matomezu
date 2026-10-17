// 線の端の形（heads.ts、docs/HEADS-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { HEADS, headDraw, headOf, headPatch, headsPatch } from "../web/src/heads";
import type { EdgeData, EdgeInfo } from "../web/src/types";
import { fakeMeasure, pointsOf } from "./helpers";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

test("headOf: startHead / endHead が優先、無ければ今までの arrow を塗りの三角として読む", () => {
  expect(headOf({ from: 1, to: 2, arrow: "both" }, "start")).toBe("arrow");
  expect(headOf({ from: 1, to: 2, arrow: "both", endHead: "hollow" }, "end")).toBe("hollow");
  expect(headOf({ from: 1, to: 2 }, "end")).toBeNull();
});

test("headsPatch: 塗りの三角は arrow、ほかは startHead / endHead に書く", () => {
  expect(headsPatch("arrow", "arrow")).toEqual({ arrow: "both", startHead: null, endHead: null });
  expect(headsPatch("one", "many")).toEqual({ arrow: null, startHead: "one", endHead: "many" });
  expect(headsPatch(null, "arrow")).toEqual({ arrow: "end", startHead: null, endHead: null });
  expect(headsPatch("hollowDiamond", "arrow")).toEqual({ arrow: "end", startHead: "hollowDiamond", endHead: null });
});


test("どの種類も何か描き、線を形の付け根で止める長さは 0 以上", () => {
  for (const h of HEADS) {
    const d = headDraw(h, [0, 0], [100, 0]);
    expect(d.fill + d.stroke).not.toBe("");
    expect(d.trim).toBeGreaterThanOrEqual(0);
  }
});

test("headsPatch と headOf は行き来できる: どの組（無しを含む）も、書いた変更を読めば同じ両端の形", () => {
  const kinds = [null, ...HEADS];
  for (const s of kinds) for (const e of kinds) {
    const p = headsPatch(s, e);
    const src: EdgeData = { from: 1, to: 2 };
    for (const [k, v] of Object.entries(p)) if (v != null) (src as unknown as Record<string, unknown>)[k] = v;
    expect([s, e, headOf(src, "start"), headOf(src, "end")]).toEqual([s, e, s, e]);
  }
});

test("headPatch: 片方の端だけを変え、もう一方の端の形は保つ。無し（null）にもできる", () => {
  const now = { startHead: "diamond", endHead: "arrow" } as const;
  expect(headPatch(now, "end", "many")).toEqual(headsPatch("diamond", "many"));
  expect(headPatch(now, "start", null)).toEqual({ arrow: "end", startHead: null, endHead: null });
  expect(headPatch(now, "start", "arrow")).toEqual({ arrow: "both", startHead: null, endHead: null });
});

test("headDraw: 長さ 1 未満の区間には何も描かず、線も縮めない。向きを変えても、形の付け根で止める長さは同じ", () => {
  for (const h of HEADS) {
    expect(headDraw(h, [0, 0], [0.5, 0.5])).toEqual({ fill: "", stroke: "", trim: 0 });
    const trims = [[100, 0], [0, 100], [-100, 0], [0, -100], [60, 80]].map(([x, y]) => headDraw(h, [0, 0], [x!, y!]).trim);
    expect(new Set(trims).size).toBe(1);
  }
});

test("headDraw: 形は先端（tip）から出て、区間の長さを越えない範囲に描く（横向きの線なら x は先端から 21 以内、y は軸から ±7 以内。輪の半径の指定は点ではない）", () => {
  for (const h of HEADS) {
    const d = headDraw(h, [0, 50], [100, 50]);
    const nums = (d.fill + d.stroke).replace(/A4,4 0 1 1 /g, "L").match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g)!.map(p => p.split(",").map(Number) as [number, number]);
    for (const [x, y] of nums) {
      expect(x).toBeGreaterThanOrEqual(100 - 21);
      expect(x).toBeLessThanOrEqual(100);
      expect(Math.abs(y - 50)).toBeLessThanOrEqual(7);
    }
  }
});

test("描画: 白抜きは線で描いて見える線を付け根で止め、塗りの三角は塗る。updateEdge で変えられる", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, {
    world: { route: "straight" },
    nodes: [{ id: 1, caption: "A", x: 0, y: 0 }, { id: 2, caption: "B", x: 400, y: 0 }],
    edges: [{ id: "e1", from: 1, to: 2, arrow: "start", endHead: "hollow" }],
  }, { measureText: fakeMeasure });
  const g = el.querySelector(".mz-edge")!;
  expect(g.querySelector(".mz-arrow")!.getAttribute("d")).not.toBe("");
  expect(g.querySelector(".mz-arrow-line")!.getAttribute("d")).not.toBe("");
  const hit = pointsOf(g.querySelector(".mz-hit")!), line = pointsOf(g.querySelector(".mz-line")!);
  expect(hit.at(-1)![0] - line.at(-1)![0]).toBeCloseTo(10, 0);
  expect((graph.edgeInfo("e1") as EdgeInfo)).toMatchObject({ startHead: "arrow", endHead: "hollow" });
  graph.updateEdge("e1", headsPatch("one", "zeroMany"));
  expect((graph.toJSON().edges as EdgeData[])[0]).toEqual({ id: "e1", from: 1, to: 2, startHead: "one", endHead: "zeroMany" });
  expect(g.querySelector(".mz-arrow")!.getAttribute("d")).toBe("");
});
