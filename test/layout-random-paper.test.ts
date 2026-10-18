// ランダムな操作でも崩れない（紙あり）。重いので、配置に関係しない修正では飛ばす（package.json の test:quick）。
// 紙ありと紙なしをファイルに分けて、並列（bun test --parallel）で流す
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { fakeMeasure, PLAIN_GAPS, violations } from "./helpers";
import { random, randomOp, sample, withoutSizes } from "./random-ops";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

// 紙ありの種 1 では、紙に空きが無いときの置き場所探しが重なりを許して、ドラッグのあと兄弟が重なっていた（2026-10-17、単体テストを紙ありにして見つけた P1。原因は P3 と同じ findFreeSpot）
test.each([1, 2, 3])("種 %i（紙あり）", seed => {
  const rnd = random(seed * 7919);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, sample(), { measureText: fakeMeasure, ...PLAIN_GAPS, paper: true });
  graphs.push(graph);
  const log: string[] = [];
  for (let step = 0; step < 150; step++) {
    log.push(randomOp(el, graph, rnd));
    const v = violations(el);
    if (v.length) throw new Error(`${log.slice(-3).join(" / ")}: ${v.join(", ")}`);
    // Undo して Redo すれば、同じ状態に戻る
    if (graph.history().canUndo) {
      const before = withoutSizes(graph.toJSON());
      graph.undo();
      graph.redo();
      expect(withoutSizes(graph.toJSON())).toBe(before);
    }
  }
}, 60000);
