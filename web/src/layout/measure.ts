// 文字の大きさを測る。ブラウザでの測り方（browserMeasure）を、テストでは偽物に差し替えられるようにする
import type { Box } from "../model";
import { layoutStats } from "./stats";

// ボックスの本体（head）を幅 width（null なら1行のまま）にしたときの大きさを返す
export type MeasureText = (head: HTMLElement, width: number | null) => [number, number];

// 測るたびにブラウザが配置を計算し直す（一番重い処理）
export const browserMeasure: MeasureText = (head, width) => {
  const s = head.style;
  const prev = [s.width, s.height] as const;
  s.width = width == null ? "max-content" : width + "px";
  s.height = "auto";
  // offsetWidth は整数に丸めるので、実際の幅より小さいとその幅で最後の文字が折り返される。小数まで測って切り上げる
  // （配置の計算が無い環境では 0 が返るので offsetWidth を使う）
  const rect = head.getBoundingClientRect();
  const r: [number, number] = [
    rect.width ? Math.ceil(rect.width) : head.offsetWidth,
    rect.height ? Math.ceil(rect.height) : head.offsetHeight,
  ];
  [s.width, s.height] = prev;
  return r;
};

export interface TextMeasurer {
  measure(n: Box, width: number | null): [number, number];
  dispose(): void;
}

// 表示に関わるもの（クラス、文字、幅、行の高さ）が同じなら、測った結果を使い回す。
// フォントの読み込みが終わると文字の幅が変わるので捨てる
export function createTextMeasurer(measureText: MeasureText = browserMeasure): TextMeasurer {
  const cache = new Map<string, [number, number]>();
  const clear = () => cache.clear();
  if (typeof document !== "undefined") document.fonts?.addEventListener?.("loadingdone", clear);
  return {
    measure(n, width) {
      const t = n.textEl;
      const key = `${n.head.className}|${t.className}|${t.style.lineHeight}|${width}|${t.textContent}`;
      const hit = cache.get(key);
      if (hit) return hit;
      layoutStats.measures++;
      const r = measureText(n.head, width);
      if (cache.size > 2000) cache.clear();
      cache.set(key, r);
      return r;
    },
    dispose() {
      if (typeof document !== "undefined") document.fonts?.removeEventListener?.("loadingdone", clear);
    },
  };
}
