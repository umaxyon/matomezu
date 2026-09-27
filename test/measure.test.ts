// 文字の測り方のテスト
import { expect, test } from "bun:test";
import { browserMeasure, createTextMeasurer } from "../web/src/measure";
import type { Box } from "../web/src/model";
import { layoutStats } from "../web/src/stats";

test("ブラウザの測り方: 小数まで測って切り上げ、幅と高さの指定を元に戻す", () => {
  // offsetWidth は整数に丸めるので、実際の幅より小さくなることがある（最後の文字が折り返される）
  const head = document.createElement("div");
  head.style.width = "120px";
  head.style.height = "64px";
  const seen: string[] = [];
  head.getBoundingClientRect = () => {
    seen.push(head.style.width);
    return { width: 170.4, height: 26.2 } as DOMRect;
  };
  expect(browserMeasure(head, null)).toEqual([171, 27]);
  expect(browserMeasure(head, 150)).toEqual([171, 27]);
  expect(seen).toEqual(["max-content", "150px"]); // 1行のまま測るときは max-content
  expect([head.style.width, head.style.height]).toEqual(["120px", "64px"]);
});

test("表示に関わるものが同じなら、測った結果を使い回す", () => {
  const box = (text: string, cls = "mz-leaf") => {
    const head = document.createElement("div");
    const textEl = document.createElement("div");
    head.className = cls;
    textEl.textContent = text;
    head.append(textEl);
    return { head, textEl } as unknown as Box;
  };
  const calls: (number | null)[] = [];
  const m = createTextMeasurer((_, width) => { calls.push(width); return [10, 20]; });
  const before = layoutStats.measures;
  m.measure(box("a"), null);
  m.measure(box("a"), null); // 同じ
  m.measure(box("a"), 100); // 幅が違う
  m.measure(box("b"), null); // 文字が違う
  m.measure(box("a", "mz-leaf mz-size-S"), null); // クラスが違う
  expect(calls).toEqual([null, 100, null, null]);
  expect(layoutStats.measures - before).toBe(4);
  m.dispose();
});
