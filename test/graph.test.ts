import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxData, Diagram } from "../web/src/types";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram, opts = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, data, opts);
  return { el, graph };
}

const byId = (d: Diagram, id: number) => d.nodes.find(n => n.id === id)!;

// 2つの矩形が gap 以上離れているか
function apart(a: BoxData, ai: { w: number; h: number }, b: BoxData, bi: { w: number; h: number }, gap = 8) {
  return a.x! + ai.w + gap <= b.x! || b.x! + bi.w + gap <= a.x! ||
         a.y! + ai.h + gap <= b.y! || b.y! + bi.h + gap <= a.y!;
}

test("未知の項目を残したまま保存する", () => {
  const { graph } = setup({ title: "t", nodes: [{ id: 1, memo: "x" }, { id: 2 }], edges: [[1, 2]] });
  const out = graph.toJSON();
  expect(out.title).toBe("t");
  expect(out.nodes[0]!.memo).toBe("x");
  expect(out.edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
});

test("自動配置した最上位のボックスは重ならない", () => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, caption: `box ${i + 1}` }));
  const { graph } = setup({ nodes });
  const out = graph.toJSON();
  for (const a of out.nodes) for (const b of out.nodes) {
    if (a === b) continue;
    expect(apart(a, graph.info(a.id!), b, graph.info(b.id!))).toBe(true);
  }
});

test("ドラッグで動かし、ぶつかる相手の中には入らない", () => {
  const changes: Diagram[] = [];
  const { el, graph } = setup(
    { nodes: [{ id: 1, x: 100, y: 100 }, { id: 2, x: 400, y: 100 }] },
    { onChange: (d: Diagram) => changes.push(d) },
  );
  graph.select(1);
  const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
  const fire = (type: string, x: number) =>
    head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  for (const x of [100, 200, 300]) fire("pointermove", x); // 最後は 2 に重なる位置
  fire("pointerup", 300);

  const out = graph.toJSON();
  // 2（x=400）の左に、間隔 8px を空けて止まる
  expect(byId(out, 1).x).toBe(400 - 8 - graph.info(1).w);
  expect(apart(byId(out, 1), graph.info(1), byId(out, 2), graph.info(2))).toBe(true);
  expect(changes.length).toBe(1);
});

test("ツリーから内包に戻すと、元の位置に戻る", () => {
  const { graph } = setup({ nodes: [{ id: 1 }, { id: 2, parent: 1, x: 40, y: 50 }, { id: 3, parent: 1, x: 200, y: 50 }] });
  const before = graph.toJSON();
  graph.update(1, { childView: "tree" });
  graph.update(1, { childView: "nest" });
  const after = graph.toJSON();
  expect([byId(after, 2).x, byId(after, 2).y]).toEqual([byId(before, 2).x!, byId(before, 2).y!]);
  expect([byId(after, 3).x, byId(after, 3).y]).toEqual([byId(before, 3).x!, byId(before, 3).y!]);
});

test("Ctrl+クリックで同じ階層の2つに線を引き、階層が違えば引かない", () => {
  const { el, graph } = setup({ nodes: [{ id: 1 }, { id: 2 }, { id: 3, parent: 2 }] });
  const click = (id: number) => {
    graph.select(id);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    head.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ctrlKey: true, pointerId: 1 }));
  };
  click(1); click(3);
  expect(graph.toJSON().edges).toEqual([]);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  click(1); click(2);
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
});

test("検証エラーのときは例外を投げ、表示は元のまま", () => {
  const { graph } = setup({ nodes: [{ id: 1, caption: "keep" }] });
  expect(() => graph.load({ nodes: [{ id: 1, parent: 1 }] })).toThrow("循環");
  expect(graph.info(1).caption).toBe("keep");
});

test("読み込んだ直後、右にはみ出したボックスを、つながる相手の真下へ移す", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, caption: "表示内", x: 300, y: 40 },
      { id: 2, caption: "はみ出し", x: 1100, y: 40 },
      { id: 3, caption: "無関係", x: 40, y: 300 },
    ],
    edges: [[1, 2]],
  });
  const out = graph.toJSON();
  const a = graph.info(1), b = graph.info(2);
  expect(b.x + b.w).toBeLessThanOrEqual(1000);
  expect(b.y).toBeGreaterThan(a.y + a.h);
  expect(b.x + b.w / 2).toBe(a.x + a.w / 2); // 真下なので線は垂直
  expect([byId(out, 1).x, byId(out, 1).y, byId(out, 3).x, byId(out, 3).y]).toEqual([300, 40, 40, 300]);
});

test("つながる相手が無ければ一番下へ。ワールドの幅が指定されていれば動かさない", () => {
  const { graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 1200, y: 40 }] });
  expect(graph.info(2).x + graph.info(2).w).toBeLessThanOrEqual(1000);
  expect(graph.info(2).y).toBeGreaterThan(graph.info(1).y + graph.info(1).h);
  graph.destroy();

  const fixed = setup({ world: { width: 1600 }, nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 1200, y: 40 }] }).graph;
  expect(fixed.info(2).x).toBe(1200);
});

test("ウィンドウの大きさが変わっても動かさない（読み込みのときだけ）", () => {
  const { graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 600, y: 40 }] });
  // 表示領域が狭くなったことにして、変更（読み込み以外）をしても位置は保たれる
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 500 });
  try {
    graph.update(1, { color: "#ff0000" });
    expect(graph.info(2).x).toBe(600);
  } finally {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1000 });
  }
});

test("形: スティックマンと DB に切り替え、ボックスに戻すと項目を消す", () => {
  const { el, graph } = setup({ nodes: [{ id: 1, caption: "利用者" }, { id: 2, caption: "DB" }] });
  graph.update(1, { shape: "person" });
  graph.update(2, { shape: "db" });
  const out = graph.toJSON();
  expect([byId(out, 1).shape, byId(out, 2).shape]).toEqual(["person", "db"]);

  const heads = [...el.querySelectorAll(".mz-head")];
  const person = heads.find(h => h.classList.contains("mz-shape-person"))!;
  const db = heads.find(h => h.classList.contains("mz-shape-db"))!;
  expect(person.querySelector(".mz-shape circle")).not.toBeNull();
  expect(db.querySelector(".mz-db-body")!.getAttribute("d")).toMatch(/^M1,9A/);
  expect(graph.info(2).h).toBe(64); // ボックスと同じ高さ
  // スティックマンは文字の置き方が決まっているので、中身の扱いは選べない
  expect(graph.info(1).overflows).toEqual([]);

  graph.update(1, { shape: "box" });
  expect("shape" in byId(graph.toJSON(), 1)).toBe(false);
});

test("形: 内包しているグループは選べず、ツリーにすると選べる", () => {
  const { graph } = setup({ nodes: [{ id: 1, shape: "db" }, { id: 2, parent: 1 }] });
  const info = () => graph.info(1) as import("../web/src/types").BoxInfo;
  expect([info().canShape, info().shape]).toEqual([false, "box"]);
  graph.update(1, { childView: "tree" });
  expect([info().canShape, info().shape]).toEqual([true, "db"]);
});

test("ツリーで見せると全体を枠で囲み、同じ階層との線は枠のふちにつなぐ", () => {
  const { el, graph } = setup({
    nodes: [
      { id: 1, caption: "バックエンド", childView: "tree", x: 40, y: 40 },
      { id: 2, caption: "API", parent: 1 }, { id: 3, caption: "データ", parent: 1 },
      { id: 4, caption: "外部", x: 40, y: 500 },
    ],
    edges: [[1, 4]],
  });
  const g = graph.info(1);
  const frame = el.querySelector(".mz-tree-frame")!;
  expect(Number(frame.getAttribute("width"))).toBeCloseTo(g.w - 1.5);
  expect(Number(frame.getAttribute("height"))).toBeCloseTo(g.h - 1.5);

  // 線は枠の下のふちから出る（本体の下ではない）
  const line = el.querySelector(".mz-line")!;
  const ys = [Number(line.getAttribute("y1")), Number(line.getAttribute("y2"))];
  expect(Math.min(...ys)).toBeCloseTo(g.y + g.h);

  // 内包に戻すと枠は隠れ、データも変わらない
  graph.update(1, { childView: "nest" });
  expect((el.querySelector(".mz-tree") as HTMLElement).style.display).toBe("none");
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 4 }]);
});

// 最上位のボックスどうしが重なっていないか
function noOverlap(graph: Graph, ids: number[]) {
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const p = graph.info(a), q = graph.info(b);
    const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
    expect(apart).toBe(true);
  }
}

test("子をツリーにして大きくなったら、重なる相手を下へずらす（変えた方はその場に残す）", () => {
  const { graph } = setup({
    nodes: [
      // 外部サービスを先に書く（データの順では先に置かれる方）
      { id: 9, caption: "外部サービス", x: 300, y: 420 },
      { id: 1, caption: "バックエンド", childView: "tree", x: 100, y: 100 },
      { id: 2, caption: "API", parent: 1 },
      { id: 3, caption: "認証", parent: 2 }, { id: 4, caption: "注文", parent: 2 },
      { id: 5, caption: "データ", parent: 1 },
    ],
    edges: [[1, 9]],
  });
  const before = graph.info(1);
  expect(graph.info(9).y).toBeGreaterThanOrEqual(before.y + before.h); // 最初は重なっていない

  graph.update(2, { childView: "tree" }); // API をツリーにすると、バックエンド全体が縦に伸びる
  const after = graph.info(1);
  expect(after.h).toBeGreaterThan(before.h);
  expect([after.x, after.y]).toEqual([before.x, before.y]); // 変えた側は動かない
  noOverlap(graph, [1, 9]);
  expect(graph.info(9).x).toBe(300); // 相手はまっすぐ下へずれる
});

test("ワールドの高さが指定されていなければ、下へ広がる", () => {
  const { graph } = setup({
    nodes: [{ id: 1, x: 40, y: 600, height: 64 }, { id: 2, x: 40, y: 680 }],
  });
  graph.update(1, { overflow: "clip" }); // 何か変更して、配置し直させる
  graph.update(1, { caption: "とても長いキャプションが入って高さが伸びるボックス".repeat(4), overflow: "wrap" });
  noOverlap(graph, [1, 2]);
  const i2 = graph.info(2);
  expect(i2.y + i2.h).toBeGreaterThan(700); // 表示領域（700）より下まで広がってよい
});

test("重なってしまったボックスも、ドラッグで引き離せる", () => {
  // 狭いワールドに2つ置くと、置き場が無く重なる
  const { el, graph } = setup({ world: { width: 200, height: 80 }, nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 40, y: 0 }] });
  graph.select(2);
  const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
  const x0 = graph.info(2).x;
  head.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 0, pointerId: 1 }));
  head.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 0, pointerId: 1 }));
  head.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  expect(graph.info(2).x).not.toBe(x0);
});

test("ワールドの背景色を変え、明るさに合わせて配色を切り替え、なしで元に戻す", () => {
  const { el, graph } = setup({ nodes: [{ id: 1 }] });
  const worldEl = el.querySelector(".mz-world") as HTMLElement;

  graph.update(null, { background: "#ffffff" });
  expect(graph.toJSON().world).toEqual({ background: "#ffffff" });
  expect(graph.info(null)).toMatchObject({ kind: "world", background: "#ffffff" });
  expect(worldEl.classList.contains("mz-on-light")).toBe(true);

  graph.update(null, { background: "#0f172a" });
  expect(worldEl.classList.contains("mz-on-dark")).toBe(true);
  expect(worldEl.classList.contains("mz-on-light")).toBe(false);

  graph.update(null, { background: null });
  expect(graph.toJSON().world?.background).toBeUndefined();
  expect(worldEl.style.background).toBe("");
  expect(worldEl.classList.contains("mz-on-dark")).toBe(false);
});

test("背景色はファイルから読み込める", () => {
  const { el } = setup({ world: { background: "#fefce8" }, nodes: [] });
  const worldEl = el.querySelector(".mz-world") as HTMLElement;
  expect(worldEl.style.background).not.toBe("");
  expect(worldEl.classList.contains("mz-on-light")).toBe(true);
});
