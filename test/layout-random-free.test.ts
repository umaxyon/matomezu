// ランダムな操作でも崩れない（紙なし（マスターと同じ広がるワールド））。重いので、配置に関係しない修正では飛ばす（package.json の test:quick）。
// 紙ありと紙なしをファイルに分けて、並列（bun test --parallel）で流す
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { fakeMeasure, PLAIN_GAPS, violations } from "./helpers";
import { random, randomOp, sample } from "./random-ops";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

test.each([1, 2, 3])("種 %i（紙なし）", seed => {
  const rnd = random(seed * 7919);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, sample(), { measureText: fakeMeasure, ...PLAIN_GAPS, paper: false });
  graphs.push(graph);
  const log: string[] = [];
  for (let step = 0; step < 150; step++) {
    log.push(randomOp(el, graph, rnd));
    const v = violations(el);
    if (v.length) throw new Error(`${log.slice(-3).join(" / ")}: ${v.join(", ")}`);
    // Undo して Redo すれば、同じ状態に戻る
    if (graph.history().canUndo) {
      const before = JSON.stringify(graph.toJSON());
      graph.undo();
      graph.redo();
      expect(JSON.stringify(graph.toJSON())).toBe(before);
    }
  }
}, 60000);
