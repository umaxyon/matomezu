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
  // 本体（本文があれば本文も含めて）の大きさ。captionOnly なら本文を隠して測る（キャプションだけの幅を知るため）
  measure(n: Box, width: number | null, captionOnly?: boolean): [number, number];
  // 本文だけの大きさ（width は本文の幅。内包する箱の見出しの下に置く本文を測る。docs/BODY-plan.md）
  body(n: Box, width: number | null): [number, number];
  // グループの見出しを 1 行で出すのに要る幅（見出しの左右の余白を含む）。見出しは箱の中に位置を決めて置く
  // （position: absolute）ので、本体を測っても箱の幅に表れない。見出しの要素そのものを測る
  caption(n: Box): number;
  dispose(): void;
}

// 表示に関わるもの（クラス、文字、幅、行の高さ）が同じなら、測った結果を使い回す。
// フォントの読み込みが終わると文字の幅が変わるので捨てる。
// 表示されていない要素（非表示の親の中。display: none）は幅も高さも 0 と測れるので、その結果は覚えない（覚えると、表示したときに
// 同じ鍵で 0 を使い、幅が狭く高さの足りない箱になる。2026-10-11、リストの中で隠れていた子をツリーに戻したときに出た）
export function createTextMeasurer(measureText: MeasureText = browserMeasure): TextMeasurer {
  const cache = new Map<string, [number, number]>();
  const remember = (key: string, r: [number, number]) => {
    if (!r[0] && !r[1]) return;
    if (cache.size > 2000) cache.clear();
    cache.set(key, r);
  };
  const clear = () => cache.clear();
  if (typeof document !== "undefined") document.fonts?.addEventListener?.("loadingdone", clear);
  return {
    measure(n, width, captionOnly = false) {
      const t = n.textEl, b = n.bodyEl;
      const body = b && !b.hidden && !captionOnly ? `${b.dataset.lines ?? ""}|${b.textContent}` : "";
      const key = `${n.head.className}|${t.className}|${t.style.lineHeight}|${width}|${t.textContent}|${body}`;
      const hit = cache.get(key);
      if (hit) return hit;
      layoutStats.measures++;
      const hide = !!b && !b.hidden && captionOnly;
      if (hide) b.hidden = true;
      const r = measureText(n.head, width);
      if (hide) b.hidden = false;
      remember(key, r);
      return r;
    },
    body(n, width) {
      const b = n.bodyEl;
      const key = `body|${n.head.className}|${width}|${b.dataset.lines ?? ""}|${b.textContent}`;
      const hit = cache.get(key);
      if (hit) return hit;
      layoutStats.measures++;
      const r = measureText(b, width);
      remember(key, r);
      return r;
    },
    caption(n) {
      const t = n.textEl;
      const key = `caption|${n.head.className}|${t.className}|${t.textContent}`;
      const hit = cache.get(key);
      if (hit) return hit[0];
      layoutStats.measures++;
      const r = measureText(t, null);
      remember(key, r);
      return r[0];
    },
    dispose() {
      if (typeof document !== "undefined") document.fonts?.removeEventListener?.("loadingdone", clear);
    },
  };
}
