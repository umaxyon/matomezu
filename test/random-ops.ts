// 配置のテストで使うランダムな操作（test/layout.test.ts の決まった操作の列と、test/layout-random-*.test.ts の崩れないかの確かめ）
import type { Graph } from "../web/src/graph";
import type { Patch } from "../web/src/types";
import { example } from "./helpers";

export const sample = () => example("three-levels");

// 決まった種の乱数（毎回同じ操作になる）
export function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ランダムな操作を1つ行い、何をしたかを返す
export function randomOp(el: HTMLElement, g: Graph, rnd: () => number): string {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const ids = g.toJSON().nodes.map(n => n.id!);
  const id = pick(ids);
  const op = pick(["view", "dir", "size", "shape", "caption", "fit", "reparent", "drag", "undo"] as const);
  const patches: Record<string, () => Patch> = {
    view: () => ({ childView: pick(["nest", "list", "hidden"] as const) }),
    size: () => ({ size: pick(["L", "M", "S"] as const) }),
    shape: () => ({ shape: pick(["box", "person", "db"] as const) }),
    caption: () => ({ caption: pick(["短", "少し長いキャプション", "とても長いキャプションが入ったボックスの例"]) }),
  };
  if (op === "dir") {
    // ツリーのページの向き（内包のページでも world に書くだけ）
    const p: Patch = { treeDirection: pick(["down", "up", "left", "right"] as const) };
    g.update(null, p);
    return `dir world ${JSON.stringify(p)}`;
  }
  if (patches[op]) {
    const p = patches[op]!();
    g.update(id, p);
    return `${op} ${id} ${JSON.stringify(p)}`;
  }
  if (op === "fit") {
    const w = pick(["width", "height", "both"] as const);
    g.fitChildren(id, w);
    return `fit ${id} ${w}`;
  }
  if (op === "reparent") {
    const to = pick([null, ...ids]);
    try { g.reparent(id, to); } catch { /* 自分や子孫の中へは移せない */ }
    return `reparent ${id} → ${to}`;
  }
  if (op === "undo") {
    g.undo();
    return "undo";
  }
  g.select(id);
  const head = el.querySelector(".mz-node.mz-current > .mz-head");
  const dx = Math.round((rnd() - 0.5) * 400), dy = Math.round((rnd() - 0.5) * 400);
  if (head) {
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    for (let i = 1; i <= 8; i++) fire("pointermove", (dx * i) / 8, (dy * i) / 8);
    fire("pointerup", dx, dy);
  }
  return `drag ${id} ${dx},${dy}`;
}


// Undo・Redo で戻ったかを比べるデータ（箱の width・height を除く）。開いたとき・読み直しの fitToRow が狭めた幅を、隣が動いても計算し直さず覚えたままにするので、
// Undo・Redo で読み直すと別の幅になることがある（前から。D44 でデータに大きさを書くようになって見えた。残課題 F34、F31 の論点と一緒に考える）
export function withoutSizes(d: { nodes: { width?: number; height?: number }[] }): string {
  return JSON.stringify({ ...d, nodes: d.nodes.map(({ width: _w, height: _h, ...rest }) => rest) });
}
