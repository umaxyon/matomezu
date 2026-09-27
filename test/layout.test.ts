// 配置の動きを固定するテスト。配置の処理を整理するときに、動きが変わっていないことを確かめる
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram, Patch } from "../web/src/types";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data);
  graphs.push(graph);
  return { el, graph };
}

const sample = () => JSON.parse(readFileSync(`${import.meta.dir}/../examples/three-levels.json`, "utf8")) as Diagram;

type R = { x: number; y: number; w: number; h: number };
const rectOf = (n: HTMLElement): R => ({
  x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: parseFloat(n.style.width), h: parseFloat(n.style.height),
});
const apart = (a: R, b: R) =>
  a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;

// 画面に出ている全ボックスの枠（親の左上からの位置）。キャプションで並べる
function frames(el: HTMLElement) {
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

// 崩れてはいけない性質を確かめ、見つかった問題を返す
function violations(el: HTMLElement): string[] {
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

// 決まった種の乱数（毎回同じ操作になる）
function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ランダムな操作を1つ行い、何をしたかを返す
function randomOp(el: HTMLElement, g: Graph, rnd: () => number): string {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const ids = g.toJSON().nodes.map(n => n.id!);
  const id = pick(ids);
  const op = pick(["view", "dir", "size", "shape", "caption", "fit", "reparent", "drag", "undo"] as const);
  const patches: Record<string, () => Patch> = {
    view: () => ({ childView: pick(["nest", "tree", "hidden"] as const) }),
    dir: () => ({ treeDirection: pick(["down", "up", "left", "right"] as const) }),
    size: () => ({ size: pick(["L", "M", "S"] as const) }),
    shape: () => ({ shape: pick(["box", "person", "db"] as const) }),
    caption: () => ({ caption: pick(["短", "少し長いキャプション", "とても長いキャプションが入ったボックスの例"]) }),
  };
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

describe("ランダムな操作でも崩れない", () => {
  test.each([1, 2, 3])("種 %i", seed => {
    const rnd = random(seed * 7919);
    const { el, graph } = setup(sample());
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
});

test("決まった操作の結果（全ボックスの位置と大きさ）が変わらない", () => {
  const rnd = random(424242);
  const { el, graph } = setup(sample());
  const steps: string[] = [frames(el).join("\n")];
  for (let i = 0; i < 60; i++) {
    const op = randomOp(el, graph, rnd);
    steps.push(`# ${op}\n${frames(el).join("\n")}`);
  }
  expect(steps.join("\n\n")).toMatchSnapshot();
}, 60000);

describe("線でつながる相手の側の辺を保つ", () => {
  // 外部サービス（非表示）を内包にして広げ、どこが保たれるかを見る。
  // 相手は表示領域（幅 1000）の中に置く（はみ出すと、読み込み時に下へ移されて「下にいる」扱いになる）
  const data = (nx: number, ny: number, both = false): Diagram => ({
    nodes: [
      { id: 1, caption: "相手", x: nx, y: ny },
      ...(both ? [{ id: 3, caption: "反対側", x: 2 * 500 - nx, y: 2 * 300 - ny }] : []),
      { id: 2, caption: "外部", childView: "hidden", x: 500, y: 300 },
      { id: 21, caption: "決済", parent: 2 }, { id: 22, caption: "メール", parent: 2 },
    ],
    edges: [[1, 2], ...(both ? [[3, 2] as [number, number]] : [])],
  });
  const grow = (d: Diagram) => {
    const { graph } = setup(d);
    const before = graph.info(2);
    graph.update(2, { childView: "nest" });
    return { before, after: graph.info(2) };
  };

  test("相手が右: 右辺を保つ", () => {
    const { before, after } = grow(data(800, 300));
    expect(after.x + after.w).toBe(before.x + before.w);
  });
  test("相手が上: 上辺を保つ", () => {
    const { before, after } = grow(data(500, 60));
    expect(after.y).toBe(before.y);
  });
  test("相手が下: 下辺を保つ", () => {
    const { before, after } = grow(data(500, 700));
    expect(after.y + after.h).toBe(before.y + before.h);
  });
  test("相手が左右両側: 横は中心を保つ", () => {
    const { before, after } = grow(data(150, 300, true));
    expect(Math.abs(after.x + after.w / 2 - (before.x + before.w / 2))).toBeLessThanOrEqual(1);
  });

  // ツリーでは線が外枠のふちにつながるので、保つのは本体ではなく外枠の辺
  const toTree = (d: Diagram) => {
    const { graph } = setup(d);
    const before = graph.info(2);
    graph.update(2, { childView: "tree" });
    return { before, after: graph.info(2) };
  };
  test("ツリーにしたとき、相手が下: 外枠の下辺を保つ", () => {
    const { before, after } = toTree(data(500, 700));
    expect(after.y + after.h).toBe(before.y + before.h);
  });
  test("ツリーにしたとき、相手が右: 外枠の右辺を保つ", () => {
    const { before, after } = toTree(data(800, 300));
    expect(after.x + after.w).toBe(before.x + before.w);
  });

  test("入れ子の中で内包からツリーにしても、下の相手との間で上に余白を作らない", () => {
    // データ枠の中で、DB（API を内包）の右下にキャッシュがつながっている
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "データ", x: 40, y: 40 },
        { id: 2, caption: "DB", parent: 1, x: 12, y: 36 },
        { id: 3, caption: "API", parent: 2, childView: "tree", x: 12, y: 36 },
        { id: 4, caption: "認証", parent: 3, size: "S" }, { id: 5, caption: "注文", parent: 3, size: "S" },
        { id: 6, caption: "キャッシュ", parent: 1, x: 150, y: 330 },
      ],
      edges: [[2, 6]],
    } as Diagram);
    const before = graph.info(2);
    graph.update(2, { childView: "tree" });
    const after = graph.info(2);
    expect(after.y).toBeLessThanOrEqual(before.y);
    const cache = graph.info(6);
    expect(cache.y).toBeGreaterThanOrEqual(after.y + after.h); // キャッシュは下へずれる
  });
});

describe("押しのけ", () => {
  function dragBy(el: HTMLElement, graph: Graph, id: number, dx: number, dy: number) {
    graph.select(id);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    for (let i = 1; i <= 10; i++) fire("pointermove", (dx * i) / 10, (dy * i) / 10);
    fire("pointerup", dx, dy);
  }

  test("押した相手の下にある箱も、続けて下へ押す", () => {
    const { el, graph } = setup({
      nodes: [
        { id: 1, caption: "枠", x: 40, y: 40 },
        { id: 2, caption: "中", parent: 1, x: 12, y: 30 },
        { id: 8, caption: "下1", x: 40, y: 160 },
        { id: 9, caption: "下2", x: 40, y: 240 },
      ],
    });
    dragBy(el, graph, 2, 0, 150);
    const g = graph.info(1), a = graph.info(8), b = graph.info(9);
    expect(a.y).toBeGreaterThanOrEqual(g.y + g.h);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect([a.x, b.x]).toEqual([40, 40]);
  });

  test("孫を動かして祖父母が広がったら、祖父母の階層で押しのける", () => {
    const { el, graph } = setup({
      nodes: [
        { id: 1, caption: "祖父母", x: 40, y: 40 },
        { id: 2, caption: "親", parent: 1, x: 12, y: 30 },
        { id: 3, caption: "孫", parent: 2, x: 12, y: 30 },
        { id: 9, caption: "隣", x: 40, y: 260 },
      ],
    });
    const before = graph.info(9).y;
    dragBy(el, graph, 3, 0, 120);
    const g = graph.info(1), n = graph.info(9);
    expect(n.y).toBeGreaterThan(before);
    expect(n.y).toBeGreaterThanOrEqual(g.y + g.h);
  });
});

test("読み込んだデータの位置が重なっていれば、後ろのボックスを下へずらす", () => {
  const { el, graph } = setup({
    nodes: [
      { id: 1, caption: "先", x: 100, y: 100 },
      { id: 2, caption: "後", x: 120, y: 110 },
      { id: 3, caption: "枠", x: 400, y: 100 },
      { id: 31, caption: "中A", parent: 3, x: 12, y: 30 }, { id: 32, caption: "中B", parent: 3, x: 20, y: 40 },
    ],
  });
  expect(violations(el)).toEqual([]);
  expect([graph.info(1).x, graph.info(1).y]).toEqual([100, 100]); // 先に書かれた方はそのまま
  expect(graph.info(2).x).toBe(120); // 後の方は同じ x のまま下へ
  expect(graph.info(2).y).toBeGreaterThanOrEqual(100 + graph.info(1).h);
  expect(graph.info(32).x).toBe(20);
});
