// 線の端の形（heads.ts、docs/HEADS-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { HEADS, headDraw, headOf, headsPatch } from "../web/src/heads";
import type { Diagram, EdgeData, EdgeInfo } from "../web/src/types";
import { problems } from "../web/src/validate";
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

test("検査: 知らない種類は誤り", () => {
  const d: Diagram = { nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, endHead: "star" as never }] };
  expect(problems(d)).toEqual(["endHead の値が不正です: 1 - 2 (star)"]);
});

test("どの種類も何か描き、線を形の付け根で止める長さは 0 以上", () => {
  for (const h of HEADS) {
    const d = headDraw(h, [0, 0], [100, 0]);
    expect(d.fill + d.stroke).not.toBe("");
    expect(d.trim).toBeGreaterThanOrEqual(0);
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
