// 配置の土台と見た目の補正値（docs/LAYOUT-BASE-plan.md）: テーマは補正値（定数）でだけ配置に入り、テーマを変えても中心は動かない
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});
const setup = (data: Diagram) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure });
  graphs.push(graph);
  return graph;
};
const info = (g: Graph, id: number) => g.info(id) as BoxInfo;
const center = (g: Graph, id: number) => [info(g, id).x + info(g, id).w / 2, info(g, id).y + info(g, id).h / 2];

test("テーマを付箋紙にすると、ノーマルの形は補正値の分だけ四方に広がり、中心は動かない。特殊な形と S は広がらない", () => {
  const g = setup({
    nodes: [
      { id: 1, caption: "箱", x: 100, y: 100 }, { id: 2, caption: "分岐", shape: "diamond", x: 400, y: 100 },
      { id: 3, caption: "小", size: "S", x: 100, y: 300 }, { id: 4, caption: "端", shape: "stadium", x: 400, y: 300 },
    ],
  });
  const before = [1, 2, 3, 4].map(id => ({ c: center(g, id), w: info(g, id).w, h: info(g, id).h }));
  g.update(null, { theme: "sticky" });
  const after = [1, 2, 3, 4].map(id => ({ c: center(g, id), w: info(g, id).w, h: info(g, id).h }));
  for (const i of [0, 1, 2, 3]) expect(after[i]!.c).toEqual(before[i]!.c);
  expect([after[0]!.w - before[0]!.w, after[0]!.h - before[0]!.h]).toEqual([8, 8]); // ボックス: 上下左右 +4
  expect([after[3]!.w - before[3]!.w, after[3]!.h - before[3]!.h]).toEqual([8, 8]); // 角丸もノーマル
  expect([after[1]!.w, after[1]!.h]).toEqual([before[1]!.w, before[1]!.h]);        // ひし形は特殊
  expect([after[2]!.w, after[2]!.h]).toEqual([before[2]!.w, before[2]!.h]);        // S の補正値は 0
  // 戻すと、元の位置と大きさに戻る
  g.update(null, { theme: null });
  expect(info(g, 1).x).toBe(100);
  expect(info(g, 1).w).toBe(before[0]!.w);
});
