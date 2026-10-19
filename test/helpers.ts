// テストで共通に使う補助関数
import { readFileSync } from "node:fs";
import type { Graph } from "../web/src/graph";
import type { MeasureText } from "../web/src/layout/measure";
import type { Diagram } from "../web/src/types";

export const example = (name: string) =>
  JSON.parse(readFileSync(`${import.meta.dir}/fixtures/${name}.json`, "utf8")) as Diagram; // テストの土台に固定した写し（test/fixtures/README.md）

export type R = { x: number; y: number; w: number; h: number };
export const rectOf = (n: HTMLElement): R => ({
  x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: parseFloat(n.style.width), h: parseFloat(n.style.height),
});

const apart = (a: R, b: R) =>
  a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;

// 崩れてはいけない性質を確かめ、見つかった問題を返す
export function violations(el: HTMLElement): string[] {
  const out: string[] = [];
  const containers = [el.querySelector(".mz-world") as HTMLElement,
    ...[...el.querySelectorAll<HTMLElement>(".mz-node")].filter(n =>
      n.querySelector(":scope > .mz-head")!.classList.contains("mz-group"))];
  for (const c of containers) {
    const kids = [...c.querySelectorAll<HTMLElement>(":scope > .mz-node")]
      .filter(n => n.style.display !== "none" && !n.classList.contains("mz-ghost"));
    const rects = kids.map(rectOf);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (!apart(rects[i]!, rects[j]!)) out.push(`重なり: ${kids[i]!.textContent} / ${kids[j]!.textContent}`);
    }
    if (c.classList.contains("mz-world")) continue;
    const p = rectOf(c);
    for (const [i, r] of rects.entries()) {
      // 内包の子は、余白（左右下 12、上は見出し 30）の内側に収まる
      if (r.x < 11.5 || r.y < 29.5 || r.x + r.w > p.w - 11.5 || r.y + r.h > p.h - 11.5) {
        out.push(`はみ出し: ${kids[i]!.textContent}`);
      }
    }
  }
  return out;
}

// 画面に出ている全ボックスの枠（親の左上からの位置）。キャプションで並べる
export function frames(el: HTMLElement) {
  return [...el.querySelectorAll<HTMLElement>(".mz-world .mz-node")]
    .filter(n => !n.classList.contains("mz-ghost"))
    .map(n => {
      const r = rectOf(n);
      const head = rectOf(n.querySelector(":scope > .mz-head") as HTMLElement);
      const caption = (n.querySelector(":scope > .mz-head") as HTMLElement).textContent!.replace("▼", "");
      const round = (v: number) => Math.round(v * 100) / 100;
      return `${caption} ${[r.x, r.y, r.w, r.h, head.x, head.y, head.w, head.h].map(round).join(",")}`;
    });
}

// id のボックスをつかみ、(dx, dy) だけ steps 回に分けて動かして離す
export function dragBy(el: HTMLElement, graph: Graph, id: number, dx: number, dy: number, steps = 10) {
  graph.select(id);
  const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
  const fire = (type: string, x: number, y: number) =>
    head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  fire("pointerdown", 0, 0);
  for (let i = 1; i <= steps; i++) fire("pointermove", (dx * i) / steps, (dy * i) / steps);
  fire("pointerup", dx, dy);
}

// 文字の測り方の偽物（happy-dom には配置の計算が無いため）。1 文字 9px、行の高さ 18px、左右の余白 16px、上下 8px。
// 本体の文字（▼ の印を含む）を数える。本文（.mz-body）は改行ごとの行で数え、キャプションの下に足す（余白なし）
const bodyLines = (text: string, width: number | null, max = Infinity) => Math.min(max,
  text.split("\n").reduce((s, l) => s + (width == null ? 1 : Math.max(1, Math.ceil(Array.from(l).length * 9 / Math.max(1, width)))), 0));
const maxLines = (el: HTMLElement | null) => (el?.dataset.lines ? Number(el.dataset.lines) : Infinity);
const bodyWidth = (text: string) => Math.max(...text.split("\n").map(l => Array.from(l).length * 9));
export const fakeMeasure: MeasureText = (el, width) => {
  if (el.classList.contains("mz-body")) {
    const t = el.textContent ?? "";
    return [width ?? bodyWidth(t), bodyLines(t, width, maxLines(el)) * 18];
  }
  const bodyEl = el.querySelector<HTMLElement>(":scope > .mz-body");
  const body = bodyEl && !bodyEl.hidden ? bodyEl.textContent ?? "" : "";
  // リンクの箱の部品（持ち手の札・窓の文字）は本体の文字ではない（本物の測り方は隠して測る。measure.ts）
  const parts = el.querySelector<HTMLElement>(":scope > .mz-link-parts")?.textContent ?? "";
  const tw = (Array.from(el.textContent ?? "").length - Array.from(bodyEl?.textContent ?? "").length - Array.from(parts).length) * 9;
  const w = width ?? Math.max(tw, body ? bodyWidth(body) : 0) + 16;
  const lines = width == null ? 1 : Math.max(1, Math.ceil(tw / Math.max(1, width - 16)));
  // 子の無い箱の本文の幅の指定（render.ts の --mz-body-col）は、本文を箱の中で狭める（折り返した高さにだけ効く。D45）
  const col = Number.parseFloat(el.style.getPropertyValue("--mz-body-col")) || Infinity;
  return [w, lines * 18 + 8 + (body ? bodyLines(body, width == null ? null : Math.min(width - 16, col), maxLines(bodyEl)) * 18 : 0)];
};

// 線（polyline）の点の並びと、両端の座標 [x1, y1, x2, y2]
export const pointsOf = (l: Element): [number, number][] =>
  (l.getAttribute("points") ?? "").trim().split(/\s+/).filter(Boolean).map(p => p.split(",").map(Number) as [number, number]);
export function endsOf(l: Element): [number, number, number, number] {
  const p = pointsOf(l);
  return [p[0]![0], p[0]![1], p.at(-1)![0], p.at(-1)![1]];
}

// 線でつながった箱どうしの間隔（linkGap 32・captionGap 40）を入れる前に、見本の図で座標を組んだ振る舞いのテスト（押しのけ・入れ替え・
// 場面ごとの操作列など）で使う。仕組みを確かめるテストなので、つながった箱どうしの間隔も前の値（8）にしておく。
// 組ごとの間隔そのものは test/outset.test.ts
export const PLAIN_GAPS = { linkGap: 8, captionGap: 8 };
