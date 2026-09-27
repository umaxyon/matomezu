// テストで共通に使う補助関数
import { readFileSync } from "node:fs";
import type { Graph } from "../web/src/graph";
import type { Diagram } from "../web/src/types";

export const example = (name: string) =>
  JSON.parse(readFileSync(`${import.meta.dir}/../examples/${name}.json`, "utf8")) as Diagram;

export type R = { x: number; y: number; w: number; h: number };
export const rectOf = (n: HTMLElement): R => ({
  x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: parseFloat(n.style.width), h: parseFloat(n.style.height),
});

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
