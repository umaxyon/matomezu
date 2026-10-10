import { afterEach, describe, expect, test } from "bun:test";
import { type GraphEvent, noticeOf } from "../web/src/notices";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxData, BoxInfo, Diagram, EdgeData, EdgeInfo, Info } from "../web/src/types";
import { dragBy, endsOf, fakeMeasure, pointsOf } from "./helpers";
import { nearestAt } from "../web/src/geom";
import { perimeter } from "../web/src/selfloop";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram, opts = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  graph = createGraph(el, data, { measureText: fakeMeasure, ...opts });
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

test("ドラッグでぶつかった相手は、つかんだ箱の開始位置の側へどく", () => {
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
  // 1 はポインタに追従して止まらず、2 は 1 の開始位置の側（左）へ、間隔 8px を空けてどく
  expect(byId(out, 1).x).toBe(400);
  expect(byId(out, 2).x).toBe(400 - 8 - graph.info(2).w);
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

test("線モードで、Ctrl+クリックで同じ階層の2つに線を引き、階層が違えば引かない", () => {
  const { el, graph } = setup({ nodes: [{ id: 1 }, { id: 2 }, { id: 3, parent: 2 }] });
  graph.setMode("link");
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

test("線モード以外では Ctrl+クリックで線を引かない。線はどのモードでもクリックで消えない", () => {
  const { el, graph } = setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [[1, 2]] });
  const click = (id: number) => {
    graph.select(id);
    el.querySelector(".mz-node.mz-current > .mz-head")!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ctrlKey: true, pointerId: 1 }));
    el.querySelector(".mz-node.mz-current > .mz-head")!
      .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, ctrlKey: true, pointerId: 1 }));
  };
  for (const mode of ["move", "reparent"] as const) {
    graph.setMode(mode);
    el.querySelector(".mz-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
    graph.setMode("link");
    click(1); // 1 つ目を選んだところでモードを変えると、選んだものは取り消す
    graph.setMode(mode);
    expect(el.querySelector(".mz-linking")).toBeNull();
  }
  // 選択モードの Ctrl+クリックは、線を引く 1 つ目にならない
  graph.setMode("move");
  click(1); click(2);
  expect(el.querySelector(".mz-linking")).toBeNull();
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
  // 線モードでも、線のクリックでは消えない（消すのはサイドバーのボタン）
  graph.setMode("link");
  el.querySelector(".mz-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
});

test("選択モードで線をクリックすると線を選び、線の情報が届く。矢印を変えて、消せる", () => {
  const got: Info[] = [];
  const { el, graph } = setup({ nodes: [{ id: 1, caption: "A" }, { id: 2, caption: "B" }], edges: [[1, 2]] },
    { onSelect: (i: Info) => got.push(i) });
  expect(el.classList.contains("mz-mode-move")).toBe(true); // 開いた直後から、線はクリックを受ける
  graph.select(1);
  el.querySelector(".mz-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(got.at(-1)).toEqual({ kind: "edge", id: "e1", self: false, from: { id: "1", caption: "A" }, to: { id: "2", caption: "B" }, arrow: null, dash: "solid", caption: null, captionMoved: false, route: "straight", via: null, adjustable: false, endsMoved: false, aligned: true, arrangement: "stack" });
  expect(el.querySelector(".mz-edge")!.classList.contains("mz-selected")).toBe(true);
  expect(graph.selected()).toBeNull(); // ボックスの選択は外れる

  graph.updateEdge("e1", { arrow: "end" });
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2, arrow: "end" }]);
  expect(el.querySelector(".mz-arrow")!.getAttribute("d")).toMatch(/^M.*Z$/);
  // 見える線は矢印の付け根で止まり、クリックを受ける透明な線は端まで
  const end = (sel: string) => endsOf(el.querySelector(sel)!).slice(2);
  const [lx, ly] = end(".mz-line"), [hx, hy] = end(".mz-hit");
  expect(Math.hypot(hx! - lx!, hy! - ly!)).toBeCloseTo(9, 5);
  expect(got.at(-1)).toMatchObject({ kind: "edge", arrow: "end" });
  graph.updateEdge("e1", { arrow: null });
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
  expect(el.querySelector(".mz-arrow")!.getAttribute("d")).toBe("");

  graph.updateEdge("e1", { dash: "dashed" });
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2, dash: "dashed" }]);
  expect(el.querySelector(".mz-line")!.classList.contains("mz-dashed")).toBe(true);
  expect(got.at(-1)).toMatchObject({ kind: "edge", dash: "dashed" });
  graph.updateEdge("e1", { dash: "solid" }); // 実線は既定なので JSON に書かない
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
  expect(el.querySelector(".mz-line")!.classList.contains("mz-dashed")).toBe(false);

  graph.select(2); // ボックスを選ぶと、線の選択は外れる
  expect(el.querySelector(".mz-edge")!.classList.contains("mz-selected")).toBe(false);
  graph.selectEdge("e1");
  graph.removeEdge("e1");
  expect(graph.toJSON().edges).toEqual([]);
  expect(got.at(-1)).toMatchObject({ kind: "world" }); // 選んでいた線が消えたら、ワールドを選ぶ
  graph.undo();
  expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
});

test("線の arrow は start / end / both、dash は solid / dashed だけ", () => {
  expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, arrow: "left" as never }] }))
    .toThrow("arrow の値が不正です");
  expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, dash: "wavy" as never }] }))
    .toThrow("dash の値が不正です");
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
  const [, y1, , y2] = endsOf(line);
  const ys = [y1, y2];
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

describe("履歴", () => {
  test("変更を戻して進め、戻したときも onChange で知らせる", () => {
    const changes: Diagram[] = [];
    const states: string[] = [];
    const { graph } = setup({ nodes: [{ id: 1, caption: "a" }] }, {
      onChange: (d: Diagram) => changes.push(d),
      onHistory: (h: { canUndo: boolean; canRedo: boolean }) => states.push(`${h.canUndo},${h.canRedo}`),
    });
    expect(graph.history()).toEqual({ canUndo: false, canRedo: false });

    graph.update(1, { caption: "b" });
    graph.update(1, { color: "#ff0000" });
    expect(graph.history()).toEqual({ canUndo: true, canRedo: false });

    expect(graph.undo()).toBe(true);
    expect(graph.info(1)).toMatchObject({ caption: "b", color: "", paint: "#ffffff" }); // 色を書いていない（見た目は既定の白）
    expect(graph.undo()).toBe(true);
    expect(graph.info(1).caption).toBe("a");
    expect(graph.undo()).toBe(false); // 最初より前には戻れない
    expect(graph.history()).toEqual({ canUndo: false, canRedo: true });

    expect(graph.redo()).toBe(true);
    expect(graph.info(1).caption).toBe("b");
    expect(changes.at(-1)!.nodes[0]!.caption).toBe("b"); // 戻した状態も保存される
    expect(states.at(-1)).toBe("true,true");
  });

  test("戻したあとに変更すると、進む先は消える", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "a" }] });
    graph.update(1, { caption: "b" });
    graph.undo();
    graph.update(1, { caption: "c" });
    expect(graph.history().canRedo).toBe(false);
    graph.undo();
    expect(graph.info(1).caption).toBe("a");
  });

  test("ドラッグは手を離したときに1件、線の追加と削除も1件ずつ", () => {
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 40 }] });
    graph.select(1);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    const fire = (type: string, x: number, extra = {}) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1, ...extra }));
    fire("pointerdown", 0);
    for (const x of [10, 20, 30]) fire("pointermove", x);
    fire("pointerup", 30);
    expect(byId(graph.toJSON(), 1).x).toBe(70);

    graph.undo();
    expect(byId(graph.toJSON(), 1).x).toBe(40); // 途中の位置ではなく、つかむ前に戻る
    graph.redo();

    // 線を引いて、消す
    graph.setMode("link");
    const click = (id: number) => {
      graph.select(id);
      el.querySelector(".mz-node.mz-current > .mz-head")!
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ctrlKey: true, pointerId: 1 }));
    };
    click(1); click(2);
    graph.removeEdge("e1");
    expect(graph.toJSON().edges).toEqual([]);
    graph.undo();
    expect(graph.toJSON().edges).toEqual([{ id: "e1", from: 1, to: 2 }]);
    graph.undo();
    expect(graph.toJSON().edges).toEqual([]);
    expect(byId(graph.toJSON(), 1).x).toBe(70);
  });

  test("戻しても選択は保つ", () => {
    const { graph } = setup({ nodes: [{ id: 1 }, { id: 2 }] });
    graph.update(2, { caption: "x" });
    graph.select(2);
    graph.undo();
    expect(graph.selected()).toBe("2");
  });

  test("load は履歴を空にし、keepHistory なら1件足す。ただしユーザーがまだ図を変えていなければ足さずに出発点にする", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "a" }] });
    // 開いてから LLM が整えている間（ユーザーはまだ触っていない）は積まない
    graph.load({ nodes: [{ id: 1, caption: "整えた" }] }, { keepHistory: true });
    expect(graph.history()).toEqual({ canUndo: false, canRedo: false });
    // ユーザーが変えたあとの外部の変更は積む
    graph.update(1, { caption: "ユーザー" });
    graph.load({ nodes: [{ id: 1, caption: "外部の変更" }] }, { keepHistory: true });
    graph.undo();
    expect(graph.info(1).caption).toBe("ユーザー");
    graph.undo();
    expect(graph.info(1).caption).toBe("整えた");
    expect(graph.history().canUndo).toBe(false);

    graph.load({ nodes: [{ id: 1, caption: "開き直し" }] });
    expect(graph.history()).toEqual({ canUndo: false, canRedo: false });
  });

  test("外部の変更を読み直しても、位置の無い箱は直前まで描いていた位置のまま（LLM が位置を書かずに足しても、見ている配置が動かない）", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "B", x: 20, y: 20 }, { id: 2, caption: "C", x: 20, y: 300 }, { id: 3, caption: "D" }] });
    const before = [graph.info(3).x, graph.info(3).y];
    // C は動いた（データに位置がある）。D は位置が無いまま、子 E が足された
    graph.load({
      nodes: [{ id: 1, caption: "B", x: 20, y: 20 }, { id: 2, caption: "C", x: 20, y: 150 }, { id: 3, caption: "D" }, { id: 4, caption: "E", parent: 3 }],
    }, { keepHistory: true });
    expect([graph.info(3).x, graph.info(3).y]).toEqual(before);
    // 新しく足した最上位の箱は、空いている所に置く
    graph.load({ nodes: [...graph.toJSON().nodes, { id: 5, caption: "F" }] }, { keepHistory: true });
    expect([graph.info(3).x, graph.info(3).y]).toEqual(before);
    expect(Number.isFinite(graph.info(5).x)).toBe(true);
  });

  test("履歴は100件まで", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "0" }] });
    for (let i = 1; i <= 120; i++) graph.update(1, { caption: String(i) });
    let n = 0;
    while (graph.undo()) n++;
    expect(n).toBe(99);
    expect(graph.info(1).caption).toBe("21");
  });
});

describe("親子の付け替え", () => {
  const sample = (): Diagram => ({
    nodes: [
      { id: 1, caption: "フロントエンド", x: 40, y: 40 },
      { id: 2, caption: "Web", parent: 1 }, { id: 3, caption: "トップ画面", parent: 2 },
      { id: 4, caption: "バックエンド", x: 40, y: 400 },
      { id: 5, caption: "API", parent: 4 }, { id: 6, caption: "データ", parent: 4 },
      { id: 7, caption: "外部サービス", x: 600, y: 400 },
    ],
    edges: [[1, 4], [4, 7], [5, 6]],
  });
  const parentOf = (d: Diagram, id: number) => byId(d, id).parent;

  test("子孫ごと移り、同じ階層でなくなった線だけ外す", () => {
    const notices: string[] = [];
    const { graph } = setup(sample(), { onEvent: (ev: GraphEvent) => notices.push(noticeOf(ev)) });
    expect(graph.reparent(4, 2, { x: 900, y: 40 })).toBe(true); // 子を内包する先では at は使わない
    const out = graph.toJSON();
    expect(parentOf(out, 4)).toBe(2);
    expect([parentOf(out, 5), parentOf(out, 6)]).toEqual([4, 4]); // 子孫はそのまま
    // バックエンドとフロントエンド・外部サービスの線は外れ、API-データの線は残る
    expect(out.edges).toEqual([{ id: "e3", from: 5, to: 6 }]);
    expect(notices.at(-1)).toBe("「2_Web」の中へ移しました（階層が変わったため、線を 2 本外しました）");
    // 今ある子（トップ画面）の下の左端に置かれる
    const top = graph.info(3), back = graph.info(4);
    expect(back.x).toBe(top.x);
    expect(back.y).toBeGreaterThanOrEqual(top.y + top.h);
    expect(graph.selected()).toBe("4");
  });

  test("Undo 1回で、線も含めて元に戻る", () => {
    const { graph } = setup(sample());
    const before = graph.toJSON();
    graph.reparent(4, 2);
    graph.undo();
    expect(graph.toJSON()).toEqual(before);
  });

  test("子の無いボックスに移すと、そのボックスが内包の枠になる（形は使われなくなる）", () => {
    const d = sample();
    byId(d, 3).shape = "db";
    const { graph } = setup(d);
    graph.reparent(7, 3);
    const top = graph.info(3) as import("../web/src/types").BoxInfo;
    expect(top.children.map(c => c.id)).toEqual(["7"]);
    expect([top.kind, top.canShape]).toEqual(["group", false]);
    expect(byId(graph.toJSON(), 7).x).toBeGreaterThan(0); // 自動で枠の中に並ぶ
  });

  test("最上位へ出す", () => {
    const { graph } = setup(sample());
    graph.reparent(5, null, { x: 700, y: 40 });
    const out = graph.toJSON();
    expect(parentOf(out, 5)).toBeUndefined();
    expect(out.edges!.length).toBe(2); // API-データの線が外れる
  });

  test("自分や子孫の中には移せず、同じ親なら何もしない", () => {
    const { graph } = setup(sample());
    expect(() => graph.reparent(4, 4)).toThrow("自分や自分の子孫");
    expect(() => graph.reparent(4, 5)).toThrow("自分や自分の子孫");
    expect(graph.reparent(5, 4)).toBe(false);
    expect(graph.history().canUndo).toBe(false);
  });

  test("付け替えモードでドラッグして落とすと、落とした先の子になる", () => {
    const { el, graph } = setup(sample());
    graph.setMode("reparent");
    expect(graph.mode()).toBe("reparent");
    // この DOM には位置の計算が無いので、ポインタの下の要素と位置を決め打ちする
    const web = [...el.querySelectorAll(".mz-head")].find(h => h.textContent?.startsWith("Web"))!;
    const rect = HTMLElement.prototype.getBoundingClientRect;
    const doc = document as unknown as { elementsFromPoint?: (x: number, y: number) => Element[] };
    HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 700);
    doc.elementsFromPoint = () => [web];
    try {
      graph.select(7);
      const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
      const fire = (type: string, x: number) =>
        head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 100, pointerId: 1 }));
      head.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); // 乗せると関係の無いものが薄くなる
      expect(el.querySelector(".mz-dim")).not.toBeNull();
      fire("pointerdown", 100);
      fire("pointermove", 150);
      expect(el.querySelector(".mz-ghost")).not.toBeNull();
      expect(el.querySelector(".mz-dim")).toBeNull(); // ドラッグを始めたら薄い表示は消える
      expect(web.parentElement!.classList.contains("mz-drop")).toBe(true);
      expect(graph.dragging()).toBe(true);
      fire("pointerup", 150);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect;
      delete doc.elementsFromPoint;
    }
    expect(el.querySelector(".mz-ghost")).toBeNull();
    expect(parentOf(graph.toJSON(), 7)).toBe(2);
    // 位置は Web の中の座標になり、Web の内側の余白より内に収まる
    const moved = graph.info(7), webInfo = graph.info(2);
    expect(moved.x).toBeGreaterThanOrEqual(12);
    expect(moved.x + moved.w).toBeLessThanOrEqual(webInfo.w);
  });
});

describe("ツリーの向き", () => {
  // 親の本体と子の枠の位置を、ツリー全体の左上からの座標で返す
  function treeRects(el: HTMLElement) {
    const node = el.querySelector(".mz-world > .mz-node") as HTMLElement;
    const head = node.querySelector(":scope > .mz-head") as HTMLElement;
    const r = (s: CSSStyleDeclaration) => ({
      x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height),
    });
    const kids = [...node.querySelectorAll(":scope > .mz-node")].map(k => r((k as HTMLElement).style));
    return { frame: r(node.style), head: r(head.style), kids };
  }
  const data = (dir?: string): Diagram => ({
    nodes: [
      { id: 1, caption: "親", childView: "tree", ...(dir ? { treeDirection: dir } : {}), x: 40, y: 40 },
      { id: 2, caption: "子A", parent: 1 }, { id: 3, caption: "子B", parent: 1 }, { id: 4, caption: "子C", parent: 1 },
    ],
  } as Diagram);

  test.each([
    ["down", (h: R, k: R) => k.y >= h.y + h.h],
    ["up", (h: R, k: R) => k.y + k.h <= h.y],
    ["right", (h: R, k: R) => k.x >= h.x + h.w],
    ["left", (h: R, k: R) => k.x + k.w <= h.x],
  ] as const)("%s: 子が親のその向きに並び、親は子の並びの中央にそろう", (dir, beyond) => {
    const { el } = setup(data(dir));
    const { frame, head, kids } = treeRects(el);
    for (const k of kids) expect(beyond(head, k)).toBe(true);
    const vertical = dir === "down" || dir === "up";
    const center = (r: R) => (vertical ? r.x + r.w / 2 : r.y + r.h / 2);
    const first = kids[0]!, last = kids[kids.length - 1]!;
    expect(center(head)).toBeCloseTo((vertical ? first.x + last.x + last.w : first.y + last.y + last.h) / 2);
    // 子どうしは重ならず、全体が枠（余白 12px）に収まる
    for (let i = 1; i < kids.length; i++) {
      expect(vertical ? kids[i]!.x >= kids[i - 1]!.x + kids[i - 1]!.w : kids[i]!.y >= kids[i - 1]!.y + kids[i - 1]!.h).toBe(true);
    }
    for (const r of [head, ...kids]) {
      expect(r.x).toBeGreaterThanOrEqual(12);
      expect(r.y).toBeGreaterThanOrEqual(12);
      expect(r.x + r.w).toBeLessThanOrEqual(frame.w - 12 + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(frame.h - 12 + 0.01);
    }
  });

  test("サイドバーから変え、下に戻すと項目を消す", () => {
    const { graph } = setup(data());
    expect((graph.info(1) as { treeDirection: string }).treeDirection).toBe("down");
    graph.update(1, { treeDirection: "left" });
    expect(byId(graph.toJSON(), 1).treeDirection).toBe("left");
    graph.update(1, { treeDirection: "down" });
    expect("treeDirection" in byId(graph.toJSON(), 1)).toBe(false);
  });
});

type R = { x: number; y: number; w: number; h: number };

describe("ドラッグで親が広がったとき", () => {
  const group = (extra: BoxData[]): Diagram => ({
    nodes: [
      { id: 1, caption: "グループ", x: 40, y: 40 },
      { id: 2, caption: "上", parent: 1, x: 12, y: 30 },
      { id: 3, caption: "下", parent: 1, x: 12, y: 110 },
      ...extra,
    ],
  });

  test("下にある隣は下へ押しのける（止めない）", () => {
    const { el, graph } = setup(group([{ id: 9, caption: "隣", x: 40, y: 250 }]));
    const g0 = graph.info(1);
    expect(graph.info(9).y).toBeGreaterThanOrEqual(g0.y + g0.h); // 最初はすぐ下にある
    dragBy(el, graph, 3, 0, 120);
    expect(byId(graph.toJSON(), 3).y).toBe(230);
    const g = graph.info(1), n = graph.info(9);
    expect(n.y).toBeGreaterThanOrEqual(g.y + g.h); // 押されて、重ならない
    expect(n.x).toBe(40);
    graph.undo();
    expect([byId(graph.toJSON(), 3).y, byId(graph.toJSON(), 9).y]).toEqual([110, 250]); // 1回で戻る
  });

  test("右にある隣は右へ押しのけ、ワールドの幅を超えるなら止める", () => {
    const { el, graph } = setup(group([{ id: 9, caption: "右", x: 240, y: 40 }]));
    dragBy(el, graph, 2, 100, 0);
    const g = graph.info(1), r = graph.info(9);
    expect(byId(graph.toJSON(), 2).x).toBe(112);
    expect(r.x).toBeGreaterThanOrEqual(g.x + g.w);
    expect(r.y).toBe(40);
  });

  test("右へ押しのけるとワールドからはみ出す場合は、下へ押しのける", () => {
    const { el, graph } = setup(group([{ id: 9, caption: "右端", x: 860, y: 40 }]));
    const before = byId(graph.toJSON(), 2).x;
    dragBy(el, graph, 2, 900, 0);
    const g = graph.info(1), r = graph.info(9);
    expect(r.x).toBe(860);
    expect(r.y).toBeGreaterThanOrEqual(g.y + g.h); // 右端のボックスはグループの下へ
    // グループはワールドの右端（余白 12 の手前）までは広がる。それを越える位置へは動かさない
    expect(byId(graph.toJSON(), 2).x).toBeGreaterThan(before!);
    expect(g.x + g.w).toBe(graph.info(null).w - 12);
  });
});

describe("子の大きさをそろえる", () => {
  test("広い子は中身を詰め直して、狭い子の幅に縮む", () => {
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "バックエンド", x: 40, y: 40 },
        { id: 2, caption: "API", parent: 1, x: 12, y: 30 },
        { id: 21, caption: "認証", parent: 2, x: 12, y: 30 }, { id: 22, caption: "注文", parent: 2, x: 280, y: 90 },
        { id: 3, caption: "データ", parent: 1, x: 200, y: 250 },
        { id: 31, caption: "DB", parent: 3, x: 12, y: 30 }, { id: 32, caption: "キャッシュ", parent: 3, x: 130, y: 120 },
      ],
    });
    expect([graph.info(2).w, graph.info(3).w]).toEqual([412, 262]);
    graph.fitChildren(1, "width");
    expect([graph.info(2).w, graph.info(3).w]).toEqual([262, 262]); // データは伸びず、API が縮む
    // 注文は左へ寄り、認証と重なる分だけ下へずれる
    const order = graph.info(22), auth = graph.info(21);
    expect(order.x + order.w).toBeLessThanOrEqual(262 - 12);
    expect(order.y).toBeGreaterThanOrEqual(auth.y + auth.h);
  });

  // 文字だけのボックスは既定の大きさまで縮み、長い文字は折り返して高くなる
  test("文字のボックスは既定の幅まで縮めてそろえる", () => {
    const { graph } = setup({
      nodes: [
        { id: 1, x: 40, y: 40 },
        { id: 2, caption: "短い", parent: 1, width: 300 },
        { id: 3, caption: "とても長いキャプションの入ったボックス", parent: 1 },
      ],
    });
    graph.fitChildren(1, "both");
    const a = graph.info(2), b = graph.info(3);
    expect(a.w).toBe(b.w);
    expect(a.h).toBe(b.h);
    expect(a.w).toBeLessThan(300);
  });

  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "バックエンド", x: 40, y: 40 },
      { id: 2, caption: "API", parent: 1, x: 12, y: 30 },
      { id: 21, caption: "認証", parent: 2 }, { id: 22, caption: "注文", parent: 2 },
      { id: 3, caption: "データ", parent: 1, x: 12, y: 200, width: 400 },
      { id: 31, caption: "DB", parent: 3 },
      { id: 4, caption: "小", parent: 1, x: 500, y: 30, size: "S" },
    ],
  });

  test("幅を、全員がそろえられる一番小さい幅にそろえ、対象外（S）は変えない", () => {
    const notices: string[] = [];
    const { graph } = setup(data(), { onEvent: (ev: GraphEvent) => notices.push(noticeOf(ev)) });
    expect((graph.info(1) as import("../web/src/types").BoxInfo).sizableChildren).toBe(2);
    const s = graph.info(4).w;
    expect(graph.fitChildren(1, "width")).toBe(2);
    // データの幅は子を持つ箱では使わない（docs/SIZE-plan.md）ので、データは中身の DB に合わせた 12+120+12 = 144。
    // API は中の 2 つを詰め直して（縦に並べて）144 にそろう
    expect([graph.info(2).w, graph.info(3).w]).toEqual([144, 144]);
    expect(graph.info(4).w).toBe(s);
    expect(byId(graph.toJSON(), 2).width).toBeUndefined(); // 子を持つ箱には大きさを指定しない
    expect(byId(graph.toJSON(), 3).width).toBeUndefined();
    expect(notices.at(-1)).toBe("子 2 個の幅をそろえました");
  });

  test("両方。グループは幅だけそろえ、Undo 1回で戻る", () => {
    const { graph } = setup(data());
    const before = graph.toJSON();
    graph.fitChildren(1, "both");
    const a = graph.info(2), d = graph.info(3);
    // グループは大きさの指定を使わないので、両方のときは幅だけをそろえ、高さは詰め直さない（横へ並べ直すと幅が崩れる）
    expect(a.w).toBe(d.w);
    const apart = a.y + a.h <= d.y || d.y + d.h <= a.y || a.x + a.w <= d.x || d.x + d.w <= a.x;
    expect(apart).toBe(true);
    graph.undo();
    expect(graph.toJSON()).toEqual(before);
  });

  test("そろえられる子が1つ以下なら何もしない", () => {
    const { graph } = setup({ nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3, parent: 1, size: "S" }] });
    expect(graph.fitChildren(1, "width")).toBe(0);
    expect(graph.history().canUndo).toBe(false);
  });
});

test("左から始まる大きなボックスが少しはみ出しただけなら、読み込み時に動かさない", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, caption: "ユーザー", x: 40, y: 140 },
      { id: 2, caption: "大きな枠", x: 220, y: 100, width: 780 }, // 右端 1000 が、表示領域（1000 - 余白）を少し越える
      { id: 3, caption: "中", parent: 2 },
    ],
    edges: [[1, 2]],
  });
  expect([graph.info(2).x, graph.info(2).y]).toEqual([220, 100]);
});

describe("子を持つ箱は、大きさの指定と中身の扱いを使わず子に合わせる（docs/SIZE-plan.md）", () => {
  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "API", x: 40, y: 40, width: 400, height: 150, overflow: "wrap" }, // 指定は無視する
      { id: 2, caption: "認証", parent: 1, x: 12, y: 30 },
      { id: 3, caption: "注文", parent: 1, x: 260, y: 30 },
    ],
  });
  function press(el: HTMLElement, graph: Graph, id: number, moves: [number, number][]) {
    graph.select(id);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    for (const [x, y] of moves) fire("pointermove", x, y);
    const last = moves.at(-1) ?? [0, 0];
    fire("pointerup", last[0], last[1]);
  }

  test("箱の大きさは子の並び（260 + 120 + 余白 12）で決まり、データの指定は残る", () => {
    const { graph } = setup(data());
    expect([graph.info(1).w, graph.info(1).h]).toEqual([392, 30 + 64 + 12]);
    expect(graph.info(1).overflow).toBe("grow");
    expect(graph.info(1).overflows).toEqual([]);
    const out = byId(graph.toJSON(), 1);
    expect([out.width, out.height, out.overflow]).toEqual([400, 150, "wrap"]);
  });

  test("子を内側へ動かすと縮み、外へ動かすと広がる。Undo で戻る", () => {
    const { el, graph } = setup(data());
    press(el, graph, 3, [[-40, 0], [-80, 0], [-120, 0]]);
    expect(byId(graph.toJSON(), 3).x).toBe(140);
    expect(graph.info(1).w).toBe(272);
    graph.undo();
    expect(graph.info(1).w).toBe(392);
    press(el, graph, 3, [[100, 0]]);
    expect(graph.info(1).w).toBe(492);
  });

  test("子を持つ箱の中身の扱いは変えられない", () => {
    const { graph } = setup(data());
    expect(() => graph.update(1, { overflow: "clip" })).toThrow();
  });
});

test("子の大きさをそろえる: 縮められない子があっても、ほかの子は大きくならない", () => {
  const notices: string[] = [];
  const { graph } = setup({
    nodes: [
      { id: 1, caption: "Web", x: 40, y: 40 },
      { id: 2, caption: "トップ画面", parent: 1, x: 12, y: 30 },
      { id: 3, caption: "カート画面", parent: 1, x: 150, y: 30 },
      { id: 4, caption: "バックエンド", parent: 1, x: 12, y: 120 },
      { id: 41, caption: "データ", parent: 4, x: 12, y: 30 }, { id: 42, caption: "API", parent: 4, x: 200, y: 30 },
    ],
  }, { onEvent: (ev: GraphEvent) => notices.push(noticeOf(ev)) });
  const before = [2, 3, 4].map(id => graph.info(id).w);
  graph.fitChildren(1, "width");
  const after = [2, 3, 4].map(id => graph.info(id).w);
  for (let i = 0; i < 3; i++) expect(after[i]!).toBeLessThanOrEqual(before[i]!);
  expect(after[0]).toBe(120); // 文字のボックスは一番小さい幅のまま
  // バックエンドは中身を縦に並べ直し、中身1つ分（12 + 120 + 12）まで縮む。目標の 120 には届かない
  expect(after[2]).toBe(144);
  expect(graph.info(42).y).toBeGreaterThanOrEqual(graph.info(41).y + graph.info(41).h);
  expect(notices.at(-1)).toContain("中身の都合で狭められない子があります");
});

test("サイズを選ぶと、付いていた大きさの指定を外して中身に合わせた大きさに戻る", () => {
  const { graph } = setup({ nodes: [{ id: 1, caption: "トップ画面", x: 40, y: 40, width: 312, height: 90 }] });
  expect(graph.info(1).w).toBe(312);
  graph.update(1, { size: "M" }); // 今と同じサイズでも戻す
  const out = byId(graph.toJSON(), 1);
  expect(["width" in out, "height" in out]).toEqual([false, false]);
  expect([graph.info(1).w, graph.info(1).h]).toEqual([120, 64]);
  graph.undo();
  expect(graph.info(1).w).toBe(312);
});

describe("子の見せ方を変えても、最上位は上辺と横の中心、グループの中は左上を保つ", () => {
  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "外部サービス", childView: "tree", treeDirection: "right", x: 300, y: 200 },
      { id: 2, caption: "決済", parent: 1 }, { id: 3, caption: "メール配信", parent: 1 },
      { id: 9, caption: "下の箱", x: 300, y: 420 },
    ],
  } as Diagram);
  // 上辺と横の中心（info の x, w は線がつながる範囲。ツリーなら外枠、それ以外は本体）
  const at = (graph: Graph, id: number) => { const i = graph.info(id); return [i.x + i.w / 2, i.y]; };
  const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) <= 1); // info は整数に丸める

  test.each([
    ["ツリー → 非表示", { childView: "hidden" }],
    ["ツリー → 内包", { childView: "nest" }],
    ["ツリーの向き 右 → 下", { treeDirection: "down" }],
    ["ツリーの向き 右 → 左", { treeDirection: "left" }],
  ] as const)("%s", (_, patch) => {
    const { graph } = setup(data());
    const before = at(graph, 1);
    graph.update(1, patch);
    expect(near(at(graph, 1), before)).toBe(true);
    // 広がってもほかのボックスとは重ならない（相手の方がずれる）
    const a = graph.info(1), b = graph.info(9);
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  });

  test("非表示 → ツリーに戻しても上辺と横の中心を保つ", () => {
    const { graph } = setup(data());
    graph.update(1, { childView: "hidden" });
    const before = at(graph, 1);
    graph.update(1, { childView: "tree" });
    expect(near(at(graph, 1), before)).toBe(true);
  });

  test("入れ子の中では左上を保ち、ぶつかる兄弟が下へずれる", () => {
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "枠", x: 40, y: 40 },
        { id: 2, caption: "外部", parent: 1, childView: "hidden", x: 200, y: 60 },
        { id: 21, caption: "決済", parent: 2 }, { id: 22, caption: "メール", parent: 2 },
        { id: 3, caption: "兄弟", parent: 1, x: 200, y: 150 }, // 真下にいて、広がると重なる
      ],
    });
    graph.update(2, { childView: "tree" });
    expect([graph.info(2).x, graph.info(2).y]).toEqual([200, 60]);
    const a = graph.info(2), b = graph.info(3);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect(b.x).toBe(200); // 同じ x のまま下へ
  });
});

test("見せ方を変えて広がったボックスが大きい隣にぶつかったら、自分の方がずれる", () => {
  const { graph } = setup({
    nodes: [
      { id: 2, caption: "外部サービス", childView: "hidden", x: 40, y: 40 },
      { id: 21, caption: "決済", parent: 2 }, { id: 22, caption: "メール配信", parent: 2 },
      { id: 1, caption: "フロントエンド", x: 40, y: 150, width: 800, height: 300 }, // 真下の大きい隣
    ],
  });
  const big = graph.info(1);
  graph.update(2, { childView: "nest" }); // 左上を保って下へ伸び、真下の大きい隣に重なる
  const after = graph.info(1), ext = graph.info(2);
  expect([after.x, after.y]).toEqual([big.x, big.y]); // 大きい隣は動かない
  expect(ext.x + ext.w <= after.x || after.x + after.w <= ext.x || ext.y + ext.h <= after.y || after.y + after.h <= ext.y)
    .toBe(true); // 自分がずれて重ならない
});

test.each([
  ["サイズ L → S", { size: "S" }],
  ["形をスティックマンに", { shape: "person" }],
  ["キャプションを長く", { caption: "とても長いキャプションに書き換えて大きさが変わる" }],
] as const)("最上位は設定を変えて大きさが変わっても、上辺と横の中心を保つ: %s", (_, patch) => {
  const { graph } = setup({ nodes: [{ id: 1, caption: "外部サービス", x: 300, y: 200 }, { id: 2, x: 40, y: 40 }] });
  const cx = () => graph.info(1).x + graph.info(1).w / 2;
  const before = cx();
  graph.update(1, patch);
  expect(graph.info(1).y).toBe(200);
  expect(Math.abs(cx() - before)).toBeLessThanOrEqual(1);
});

test("はみ出しの調整は最初に開いたときだけで、外部の変更の読み直しでは行わない", () => {
  const data = (caption: string): Diagram => ({
    nodes: [{ id: 1, caption: "相手", x: 40, y: 40 }, { id: 2, caption, x: 900, y: 40 }],
    edges: [[1, 2]],
  });
  const { graph } = setup(data("右端"));
  expect(graph.info(2).x).not.toBe(900); // 最初に開いたときは下へ移す
  // LLM が位置を変えたら、はみ出していてもファイルの位置のまま（位置を変えていなければ、画面の位置を保つ。scenes.test.ts）
  graph.load({ ...data("LLM が動かした"), nodes: [data("").nodes[0]!, { id: 2, caption: "右端", x: 950, y: 40 }] }, { keepHistory: true });
  expect([graph.info(2).x, graph.info(2).y]).toEqual([950, 40]);
  graph.load(data("開き直し"));
  expect(graph.info(2).x).not.toBe(900);
});

describe("文字のボックスは中身に合わせて伸ばさない", () => {
  // 伸ばしたあとで折り返しに戻せなくなるので、文字のボックスでは grow を使わない
  const long = "とても長いキャプションの入ったボックス";

  test("データに grow があっても、折り返して既定の幅に収める", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: long, overflow: "grow" }, { id: 2, caption: long }] });
    const a = graph.info(1), b = graph.info(2);
    expect(a.overflow).toBe("wrap");
    expect([a.w, a.h]).toEqual([b.w, b.h]);
    expect(graph.toJSON().nodes[0]!.overflow).toBe("grow"); // データは書き換えない（子が入ればグループとして使う）
  });

  test("選べる扱いに grow は無く、update で指定するとエラー", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: long }] });
    expect(graph.info(1).overflows).toEqual(["wrap", "clip"]);
    expect(() => graph.update(1, { overflow: "grow" })).toThrow("文字のボックスは伸ばせません");
    expect(graph.toJSON().nodes[0]!.overflow).toBeUndefined();
  });

  test("グループはつねに grow で、選べる扱いは無い（docs/SIZE-plan.md）", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "グループ", overflow: "clip" }, { id: 2, parent: 1 }] });
    expect(graph.info(1).overflow).toBe("grow");
    expect(graph.info(1).overflows).toEqual([]);
  });
});

describe("サイズの段階", () => {
  // どのサイズも、文字が少なければ中身に合わせて小さくなり、多ければ最大の幅まで広がってから折り返す。
  // 幅の範囲: M 120〜240（既定）、L 120〜400、S 64〜96（高さ 44 固定、10 文字で切る）
  // テストの文字の幅は 1 文字 9px（test/setup.ts）
  const chars = (n: number) => "あ".repeat(n);

  test("既定は M。短い文字なら最小の幅 120", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "API" }] });
    expect((graph.info(1) as BoxInfo).size).toBe("M");
    expect([graph.info(1).w, graph.info(1).h]).toEqual([120, 64]);
  });

  test("M は文字に合わせて 240 まで広がり、それを越えると折り返す", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: chars(15) }, { id: 2, caption: chars(100) }] });
    expect(graph.info(1).w).toBeGreaterThan(120);
    expect(graph.info(1).w).toBeLessThan(240);
    expect(graph.info(2).w).toBe(240);
    expect(graph.info(2).h).toBeGreaterThan(64);
  });

  test("L は 400 まで広がる。短い文字なら M と同じ大きさ", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: chars(60), size: "L" }, { id: 2, caption: "API", size: "L" }] });
    expect(graph.info(1).w).toBe(400);
    expect([graph.info(2).w, graph.info(2).h]).toEqual([120, 64]);
  });

  test("S は 64〜96 の幅で、高さは 44 のまま", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "DB", size: "S" }, { id: 2, caption: chars(8), size: "S" }] });
    expect([graph.info(1).w, graph.info(1).h]).toEqual([64, 44]);
    expect([graph.info(2).w, graph.info(2).h]).toEqual([96, 44]);
  });

  test("あとから文字を増やすと、最大の幅まで広がる", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "トップ画面" }] });
    expect(graph.info(1).w).toBe(120);
    graph.update(1, { caption: chars(20) });
    const w = graph.info(1).w;
    expect(w).toBeGreaterThan(120);
    graph.update(1, { caption: chars(21) });
    expect(graph.info(1).w).toBe(w + 9); // 1 文字分だけ広がる
  });

  test("M は文字数で切らない", () => {
    const long = chars(40);
    const { el } = setup({ nodes: [{ id: 1, caption: long }] });
    expect(el.querySelector(".mz-node .mz-head")!.textContent).toContain(long);
  });

  test("width の指定があれば、その幅で折り返す", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: chars(60), width: 150 }] });
    expect(graph.info(1).w).toBe(150);
  });

  test("切り詰めるにしたら、今の幅を上限に1行にする。文字を減らせば縮み、増やせば上限の幅で切る", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: chars(100) }] });
    const before = graph.info(1); // 幅 240 で折り返して高い
    graph.update(1, { overflow: "clip" });
    expect([graph.info(1).w, graph.info(1).h]).toEqual([before.w, 64]);
    graph.update(1, { caption: "API" });
    expect([graph.info(1).w, graph.info(1).h]).toEqual([120, 64]); // 中身に合わせて縮む
    graph.update(1, { caption: chars(20) });
    const w = graph.info(1).w;
    expect(w).toBeGreaterThan(120);
    expect(w).toBeLessThan(before.w);
    graph.update(1, { caption: chars(100) });
    expect(graph.info(1).w).toBe(before.w); // 上限の幅で切る
  });

  test("切り詰めるから折り返すに戻すと、固定を外して中身に合わせる", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: chars(40) }] });
    graph.update(1, { overflow: "clip" });
    graph.update(1, { overflow: "wrap" });
    const out = byId(graph.toJSON(), 1);
    expect(["width" in out, "height" in out]).toEqual([false, false]);
    graph.update(1, { caption: "API" }); // 文字を減らせば縮む
    expect([graph.info(1).w, graph.info(1).h]).toEqual([120, 64]);
  });

  test("グループの最小の大きさはサイズによらず 120 × 64", () => {
    const { graph } = setup({ nodes: [{ id: 1, size: "L" }, { id: 2, parent: 1, size: "S", x: 12, y: 30 }] });
    expect([graph.info(1).w, graph.info(1).h]).toEqual([120, 86]);
  });
});

describe("グループの中のボックスは、大きさが変わっても左上を動かさない", () => {
  const long = "あ".repeat(100);
  const data = (x = 12): Diagram => ({
    nodes: [
      { id: 1, caption: "Web", x: 40, y: 40 },
      { id: 2, caption: long, parent: 1, x, y: 30 },
      { id: 3, caption: "カート画面", parent: 1, x: x + 140, y: 250 },
    ],
    edges: [[2, 3]],
  });

  test("サイズを何度切り替えても、変えたボックスも兄弟も同じ位置に戻る", () => {
    const { graph } = setup(data());
    const pos = () => [2, 3].map(id => [graph.info(id).x, graph.info(id).y]);
    const size = () => [graph.info(1).w, graph.info(1).h];
    const start = pos(), startSize = size();
    for (const s of ["L", "M", "S", "M", "S", "L", "M"] as const) {
      graph.update(2, { size: s });
      expect(pos()).toEqual(start);
    }
    expect(size()).toEqual(startSize);
  });

  test("L にしてから M に戻すと、中身が左上に寄って親が縮む", () => {
    const { graph } = setup(data());
    const before = graph.info(1);
    graph.update(2, { size: "L" });
    graph.update(2, { size: "M" });
    const top = graph.info(2);
    expect([top.x, top.y]).toEqual([12, 30]);
    expect(graph.info(1).w).toBeLessThanOrEqual(before.w);
  });

  test("もともと空けていた余白は残す", () => {
    const d = data(100);
    d.nodes[1]!.size = "L";
    const { graph } = setup(d);
    graph.update(2, { size: "M" });
    expect(graph.info(2).x).toBe(100);
  });
});

describe("線のつなぎ方", () => {
  // 線（最初の線）の両端
  const ends = (el: HTMLElement) => {
    return endsOf(el.querySelector(".mz-edge .mz-line")!);
  };

  test("上下の範囲が重なっていれば（真横に並んでいれば）、重なる範囲の真ん中の高さで水平に引く", () => {
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 300, y: 60 }], edges: [[1, 2]] });
    // 1: y 40〜104、2: y 60〜124。重なりは 60〜104、真ん中は 82
    expect(ends(el)).toEqual([160, 82, 300, 82]);
  });

  test("左右の範囲が重なっていれば（縦に並んでいれば）、重なる範囲の真ん中で垂直に引く", () => {
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 100, y: 300 }], edges: [[1, 2]] });
    // 1: x 40〜160、2: x 100〜220。重なりは 100〜160、真ん中は 130
    expect(ends(el)).toEqual([130, 104, 130, 300]);
  });

  test("どちらも重ならなければ、中心どうしを結ぶ", () => {
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }], edges: [[1, 2]] });
    const [x1, y1, x2, y2] = ends(el);
    expect(x1).not.toBe(x2);
    expect(y1).not.toBe(y2);
  });

  // 線（最初の線）の点の並び（矢印の分を縮めていない、クリックを受ける線）
  const pts = (el: HTMLElement) => pointsOf(el.querySelector(".mz-edge .mz-hit")!);

  test("折れ線は、ほぼ横に並んでいれば（縦の隙間が横の隙間の 1/3 より小さい）横・縦・横の Z 字に折れる", () => {
    // 1: 40〜160 × 40〜104（中心の高さ 72）、2: 400〜520 × 120〜184（中心の高さ 152）。隙間は横 240、縦 16。間の真ん中は x = 280
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }], edges: [{ from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)).toEqual([[160, 72], [280, 72], [280, 152], [400, 152]]);
  });

  test("折れ線は、ほぼ縦に並んでいれば縦・横・縦の Z 字に折れる", () => {
    // 1: 中心 x 100、下の辺 104。2: 180〜300 × 400〜464（中心 x 240）。隙間は横 20、縦 296。間の真ん中は y = 252
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 180, y: 400 }], edges: [{ from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)).toEqual([[100, 104], [100, 252], [240, 252], [240, 400]]);
  });

  test("折れ線は、はっきり斜めなら L 字。横の隙間が大きければ横に出て、相手の上の辺に入る", () => {
    // 2: 400〜520 × 300〜364（中心 x 460）。隙間は横 240、縦 196
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }], edges: [{ from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)).toEqual([[160, 72], [460, 72], [460, 300]]);
  });

  test("L 字で縦の隙間が大きければ、縦に出て相手の横の辺に入る", () => {
    // 2: 300〜420 × 500〜564（中心の高さ 532）。隙間は横 140、縦 396
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 300, y: 500 }], edges: [{ from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)).toEqual([[100, 104], [100, 532], [300, 532]]);
  });

  test("折れ線でも、上下か左右の範囲が重なっていれば折らずにまっすぐ結ぶ", () => {
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 300, y: 60 }], edges: [{ from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)).toEqual([[160, 82], [300, 82]]);
  });

  test("折れ線の矢印は、最後の区間の向きに付き、見える線はその区間で付け根まで縮む", () => {
    const { el } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }], edges: [{ from: 1, to: 2, route: "elbow", arrow: "end" }] });
    // L 字で上から入るので、y だけ 9 手前
    expect(pointsOf(el.querySelector(".mz-line")!).at(-1)).toEqual([460, 291]);
    expect(el.querySelector(".mz-arrow")!.getAttribute("d")).toMatch(/^M460,300/);
  });

  test("線の route が無ければ図の既定（world.route）に従い、線の route が優先する", () => {
    const { el, graph } = setup({
      world: { route: "elbow" },
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }, { id: 3, x: 40, y: 500 }],
      edges: [{ id: "e1", from: 1, to: 2 }, { id: "e2", from: 1, to: 3, route: "straight" }],
    });
    const lines = el.querySelectorAll(".mz-edge .mz-hit");
    expect(pointsOf(lines[0]!).length).toBe(3); // 斜めなので L 字
    expect(pointsOf(lines[1]!).length).toBe(2);
    graph.selectEdge("e1");
    // 既定と同じ通り方を選んだら、線の側には書かない。既定を変えると一緒に変わる
    graph.updateEdge("e1", { route: "elbow" });
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2 });
    graph.update(null, { route: "straight" });
    expect(graph.toJSON().world).toEqual({});
    expect(pointsOf(el.querySelectorAll(".mz-edge .mz-hit")[0]!).length).toBe(2);
    // 既定と違う通り方は、線の側に書く
    graph.updateEdge("e1", { route: "elbow" });
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2, route: "elbow" });
    expect(graph.info(null)).toMatchObject({ route: "straight" });
  });

  test("Z 字の中棒は、真ん中だとほかの箱を通るなら、近い空いた位置へずれる", () => {
    // 1: 40〜160 × 40〜104、2: 400〜520 × 120〜184（横の Z 字、真ん中は x = 280）。3 は 260〜380 × 60〜124 で真ん中の縦棒にかかる
    const { el } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }, { id: 3, x: 260, y: 300 }],
      edges: [{ from: 1, to: 2, route: "elbow" }],
    });
    expect(pts(el)[1]![0]).toBe(280);
    const { el: el2 } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }, { id: 3, x: 260, y: 80, width: 40 }],
      edges: [{ from: 1, to: 2, route: "elbow" }],
    });
    // 3 は 260〜300 × 80〜144。真ん中の 280 から外へ 4 ずつ探し、同じ距離なら右を先に試すので、縁に触れるだけの 300 になる
    expect(pts(el2)[1]![0]).toBe(300);
  });

  // 箱のふちの上の点の、ふち一周の割合（固定の端の値）。1: 40〜160 × 40〜104 なら一周 368
  const P = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => nearestAt(perimeter(r), x, y);
  const box1 = { x: 40, y: 40, w: 120, h: 64 };
  const round = (p: number[][]) => p.map(([x, y]) => [Math.round(x! * 10) / 10, Math.round(y! * 10) / 10]);

  test("以前の持ち方（向きの指定 exit / enter、中棒の割合 bend）は読み込むと消し、自動の形で描く。端が自由な via も消す", () => {
    const { el, graph } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }],
      edges: [
        { id: "e1", from: 1, to: 2, route: "elbow", bend: 0.25 },
        { id: "e2", from: 1, to: 2, route: "elbow", exit: "vertical", enter: "horizontal", via: [220] },
      ],
    });
    expect(pts(el)).toEqual([[160, 72], [280, 72], [280, 152], [400, 152]]); // ほぼ横に並ぶので Z 字
    expect(graph.toJSON().edges).toEqual([
      { id: "e1", from: 1, to: 2, route: "elbow" },
      { id: "e2", from: 1, to: 2, route: "elbow" },
    ]);
  });

  test("手で直した via は、両端が固定なら引けるあいだは保ち、引けなくなったら via だけ消す（端の固定は保つ）", () => {
    // 1 の右の辺の真ん中と、2 の左の辺の真ん中に固定（2: 400〜520 × 120〜184）
    const fixed = { exitAt: P(box1, 160, 72), enterAt: P({ x: 400, y: 120, w: 120, h: 64 }, 400, 152) };
    const edge = { id: "e1", from: 1, to: 2, route: "elbow" as const, ...fixed, via: [220] };
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }], edges: [edge] });
    expect(round(pts(el))).toEqual([[160, 72], [220, 72], [220, 152], [400, 152]]);
    // 2 を下げても、x = 220 の縦の区間はそのまま引ける（端は 2 の左の辺の真ん中のまま）
    graph.load({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 200 }], edges: [edge] }, { keepHistory: true });
    expect(round(pts(el))).toEqual([[160, 72], [220, 72], [220, 232], [400, 232]]);
    // 2 を 1 の左下へ動かすと、x = 220 では引けないので via を消す
    graph.load({ nodes: [{ id: 1, x: 300, y: 40 }, { id: 2, x: 120, y: 200 }], edges: [edge] }, { keepHistory: true });
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2, route: "elbow", ...fixed });
  });

  test("選択モードで中棒をドラッグすると、両端を今の位置に固定して via を書き込み、手を離すと 1 件の履歴になる。折れ線を自動に戻すと via だけ消す", () => {
    const { el, graph } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }],
      edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }],
    });
    const handle = el.querySelector<SVGElement>(".mz-bend")!;
    expect(handle.dataset.index).toBe("0");
    const fire = (type: string, x: number) =>
      handle.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 100, pointerId: 1 }));
    const before = graph.history().canUndo;
    fire("pointerdown", 280);
    fire("pointermove", 340);
    fire("pointermove", 370);
    fire("pointerup", 370);
    const e = graph.toJSON().edges![0] as EdgeData;
    expect(e.via).toEqual([370]);
    expect(e.exitAt).toBeCloseTo(P(box1, 160, 72), 4);
    expect(e.enterAt).toBeCloseTo(P({ x: 400, y: 120, w: 120, h: 64 }, 400, 152), 4);
    expect(round(pts(el))).toEqual([[160, 72], [370, 72], [370, 152], [400, 152]]);
    graph.undo();
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2, route: "elbow" });
    expect(before).toBe(false);
    graph.redo();
    graph.updateEdge("e1", { via: null });
    expect((graph.toJSON().edges![0] as EdgeData).via).toBeUndefined();
    expect(round(pts(el))[1]![0]).toBe(280);
  });

  test("コの字の外を回る区間をドラッグすると、深さが変わる（箱の外側から 12 より内へは寄らない）", () => {
    // 縦に並ぶ 2 つを、両方とも右の辺の真ん中に固定: 右を回るコの字（x = 244）
    const at = P(box1, 160, 72); // 同じ大きさの箱なので、2 の右の辺の真ん中も同じ割合
    const { el, graph } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 100, y: 300 }],
      edges: [{ id: "e1", from: 1, to: 2, route: "elbow", exitAt: at, enterAt: at }],
    });
    expect(pts(el)[1]![0]).toBe(244);
    const handle = el.querySelector<SVGElement>(".mz-bend")!;
    const fire = (type: string, x: number) =>
      handle.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 200, pointerId: 1 }));
    fire("pointerdown", 244);
    fire("pointermove", 320);
    fire("pointerup", 320);
    expect(pts(el)[1]![0]).toBe(320);
    expect((graph.toJSON().edges![0] as EdgeData).via).toEqual([320]);
    fire("pointerdown", 320);
    fire("pointermove", 100); // 箱の中へは入らず、右の辺（220）+ 12 で止まる
    fire("pointerup", 100);
    expect(pts(el)[1]![0]).toBe(232);
  });

  test("S 字の via で、折れ目の多い線を引ける。真ん中の区間をつぶすと Z 字に戻る", () => {
    // 1: 40〜160 × 40〜104、2: 400〜520 × 300〜364。両端を 1 の右と 2 の左の真ん中に固定。横・縦・横・縦・横
    const b2 = { x: 400, y: 300, w: 120, h: 64 };
    const { el, graph } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }],
      edges: [{ id: "e1", from: 1, to: 2, route: "elbow", exitAt: P(box1, 160, 72), enterAt: P(b2, 400, 332), via: [200, 180, 300] }],
    });
    expect(round(pts(el))).toEqual([[160, 72], [200, 72], [200, 180], [300, 180], [300, 332], [400, 332]]);
    expect(el.querySelectorAll(".mz-bend").length).toBe(3);
    // 3 つ目の区間（x = 300）を 1 つ目と同じ x = 200 へ動かすと、間の横の区間が 0 になるので、折れ目をまとめて Z 字に
    const handle = el.querySelector<SVGElement>('.mz-bend[data-index="2"]')!;
    const fire = (type: string, x: number) =>
      handle.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 250, pointerId: 1 }));
    fire("pointerdown", 300);
    fire("pointermove", 200);
    fire("pointerup", 200);
    expect((graph.toJSON().edges![0] as EdgeData).via).toEqual([200]);
    expect(round(pts(el))).toEqual([[160, 72], [200, 72], [200, 332], [400, 332]]);
  });

  test("中棒は両端の余白より外へは動かない", () => {
    const { el } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }],
      edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }],
    });
    const handle = el.querySelector(".mz-bend")!;
    const fire = (type: string, x: number) =>
      handle.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 100, pointerId: 1 }));
    fire("pointerdown", 280);
    fire("pointermove", 900);
    fire("pointerup", 900);
    expect(pts(el)[1]![0]).toBe(388); // 400 - 12
  });

  // 端をつまむ丸を、(x0, y0) から (x, y) へドラッグする
  const dragEnd = (el: HTMLElement, end: "exit" | "enter", x0: number, y0: number, x: number, y: number) => {
    const dot = el.querySelector<SVGElement>(`.mz-edge.mz-selected .mz-end[data-end="${end}"]`)!;
    const fire = (type: string, px: number, py: number) =>
      dot.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: px, clientY: py, pointerId: 1 }));
    fire("pointerdown", x0, y0);
    fire("pointermove", x, y);
    fire("pointerup", x, y);
  };

  test("直線の端は、選んだ線の丸をドラッグすると箱のふちのどこへでも動き、そこに固定される。もう一方の自由な端はそちらへ向く。自由に戻せる", () => {
    // 1: 40〜160 × 40〜104、2: 400〜520 × 300〜364（右下）
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }], edges: [{ id: "e1", from: 1, to: 2 }] });
    expect(el.querySelectorAll(".mz-end").length).toBe(2);
    graph.selectEdge("e1");
    dragEnd(el, "exit", 150, 80, 132, 140); // 下の辺の x = 132 の真下
    expect((graph.toJSON().edges![0] as EdgeData).exitAt).toBeCloseTo(P(box1, 132, 104), 4);
    expect(round(pts(el))[0]).toEqual([132, 104]);
    // 相手と反対側（上の辺）へも動かせる
    dragEnd(el, "exit", 132, 104, 100, 20);
    expect(round(pts(el))[0]).toEqual([100, 40]);
    graph.updateEdge("e1", { exitAt: null, enterAt: null });
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2 });
  });

  test("横に並ぶ箱どうしの直線は、片方の端を動かすと、もう一方の自由な端がそろってまっすぐのまま", () => {
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 40 }], edges: [{ id: "e1", from: 1, to: 2 }] });
    expect(pts(el)).toEqual([[160, 72], [400, 72]]); // 自動は重なる範囲の真ん中をまっすぐ
    graph.selectEdge("e1");
    dragEnd(el, "exit", 160, 72, 170, 56);
    expect(round(pts(el))).toEqual([[160, 56], [400, 56]]);
  });

  test("折れ線の端も、ドラッグした辺から出る（右の辺なら右へ、下の辺なら下へ）", () => {
    // 自動は L 字で、1 の右の辺の真ん中から出て 2 の上へ入る
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }], edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)[0]).toEqual([160, 72]);
    graph.selectEdge("e1");
    dragEnd(el, "exit", 160, 72, 170, 56); // 右の辺の上から 1/4
    expect(round(pts(el))).toEqual([[160, 56], [460, 56], [460, 300]]);
    dragEnd(el, "exit", 160, 56, 100, 120); // 下の辺の真ん中: 下へ出て 2 の左へ入る L 字
    expect(round(pts(el))).toEqual([[100, 104], [100, 332], [400, 332]]);
  });

  test("線の端をほかの線の端に 8px まで近づけると吸着し、同じ位置になる。離れていれば吸着しない", () => {
    // e2 の端は 1 の右の辺の y = 56 に固定
    const at56 = P(box1, 160, 56);
    const { el, graph } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }, { id: 3, x: 600, y: 160 }],
      edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }, { id: "e2", from: 1, to: 3, route: "elbow", exitAt: at56 }],
    });
    graph.selectEdge("e1");
    const dot = el.querySelector<SVGElement>('.mz-edge.mz-selected .mz-end[data-end="exit"]')!;
    const fire = (type: string, x: number, y: number) =>
      dot.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 160, 72);
    fire("pointermove", 170, 61); // 右の辺の y = 61。e2 の端（y = 56）まで 5px
    expect(el.querySelector(".mz-snap")).not.toBeNull();
    fire("pointerup", 170, 61);
    expect(el.querySelector(".mz-snap")).toBeNull();
    expect((graph.toJSON().edges![0] as EdgeData).exitAt).toBeCloseTo(at56, 3);
    // 9px 離れていれば吸着しない
    fire("pointerdown", 160, 56);
    fire("pointermove", 170, 65);
    expect(el.querySelector(".mz-snap")).toBeNull();
    fire("pointerup", 170, 65);
    expect((graph.toJSON().edges![0] as EdgeData).exitAt).toBeCloseTo(P(box1, 160, 65), 3);
  });

  test("整列: 両端を今の形での一番よい位置（辺の真ん中か、まっすぐ結べる位置）に固定し、手で直した区間は消す。整列済みなら押せない", () => {
    // 1 の右の辺の上の方に固定した線（2 は 1 の右、上下の範囲が 60〜104 で重なる）
    const infos: Info[] = [];
    const { el, graph } = setup({
      nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 60 }],
      edges: [{ id: "e1", from: 1, to: 2, route: "elbow", exitAt: P(box1, 160, 44) }],
    }, { onSelect: (i: Info) => infos.push(i) });
    const aligned = () => (infos.at(-1) as EdgeInfo).aligned;
    expect(round(pts(el))[0]).toEqual([160, 44]);
    graph.selectEdge("e1");
    expect(aligned()).toBe(false);
    graph.alignEdge("e1");
    expect(round(pts(el))).toEqual([[160, 82], [400, 82]]);
    expect(aligned()).toBe(true);
    const e = graph.toJSON().edges![0] as EdgeData;
    expect(e.exitAt).toBeCloseTo(P(box1, 160, 82), 3);
    expect(e.via).toBeUndefined();
    // 自由に戻す（サイドバーの「接辺の自動選択」と同じ）。自由な端もまっすぐ結ぶ位置にあるので、整列済み
    graph.updateEdge("e1", { exitAt: null, enterAt: null, via: null });
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2, route: "elbow" });
    expect(aligned()).toBe(true);
  });

  test("箱を動かしている間は、引けなくなった via もデータから消さない。手を離したときに引ければ残す（docs/EDGE-SPEC.md の P2）", () => {
    const b2 = { x: 400, y: 120, w: 120, h: 64 };
    const edge = { id: "e1", from: 1, to: 2, route: "elbow" as const, exitAt: P(box1, 160, 72), enterAt: P(b2, 400, 152), via: [220] };
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 120 }], edges: [edge] });
    graph.select(2);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    // 2 を 1 の左下（x = 220 では引けない位置）まで動かす
    for (let i = 1; i <= 10; i++) fire("pointermove", -36 * i, 16 * i);
    expect((graph.toJSON().edges![0] as EdgeData).via).toEqual([220]);
    // 元の位置へ戻してから離す
    for (let i = 9; i >= 0; i--) fire("pointermove", -36 * i, 16 * i);
    fire("pointerup", 0, 0);
    expect((graph.toJSON().edges![0] as EdgeData).via).toEqual([220]);
    expect(round(pts(el))).toEqual([[160, 72], [220, 72], [220, 152], [400, 152]]);
  });

  test("箱を動かしている間、自由な端は前の辺を保つ。手を離したとき、一番よい形より折れ目が 3 つ以上多ければ付け替える", () => {
    // 自動は L 字（1 の右から出て、2 の上へ）
    const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 400, y: 300 }], edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }] });
    expect(pts(el)).toEqual([[160, 72], [460, 72], [460, 300]]);
    graph.select(2);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    // 2 を 1 の真下へ。動かしている間は、1 の右から 2 の上へ回り込む形（折れ目 3 つ）を保つ
    for (let i = 1; i <= 10; i++) fire("pointermove", -34 * i, 0);
    const during = pts(el);
    expect([during[0], during.length - 2]).toEqual([[160, 72], 3]);
    // 離すと、まっすぐ（折れ目 0）より 3 つ多いので付け替える
    fire("pointerup", -340, 0);
    expect(pts(el).length).toBe(2);
    expect(graph.toJSON().edges![0]).toEqual({ id: "e1", from: 1, to: 2, route: "elbow" }); // データには書かない
  });

  test("exitAt / enterAt は 0 から 1 の数だけ", () => {
    expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, exitAt: 1.5 }] })).toThrow("exitAt は 0 から 1 の数");
  });

  test("exit / enter は horizontal / vertical だけ", () => {
    expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, exit: "diagonal" as never }] })).toThrow("exit の値が不正です");
    expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, enter: "up" as never }] })).toThrow("enter の値が不正です");
  });

  test("bend は 0 より大きく 1 より小さい数だけ", () => {
    expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, bend: 1.5 }] })).toThrow("bend は");
  });

  test("route は straight / elbow だけ（線と図の既定）", () => {
    expect(() => setup({ nodes: [{ id: 1 }, { id: 2 }], edges: [{ from: 1, to: 2, route: "curve" as never }] })).toThrow("route の値が不正です");
    expect(() => setup({ world: { route: "curve" as never }, nodes: [] })).toThrow("world の route の値が不正です");
  });

  test("箱が大きくなっても、真横の相手への線は水平のまま（つなぐ位置が滑る）", () => {
    const { el, graph } = setup({
      nodes: [{ id: 1, caption: "相手", x: 40, y: 120 }, { id: 2, caption: "枠", x: 300, y: 88 }, { id: 3, parent: 2 }, { id: 4, parent: 2 }],
      edges: [[1, 2]],
    });
    graph.update(2, { childView: "tree" });
    const [, y1, , y2] = ends(el);
    expect(y1).toBe(y2);
  });
});

test("ポインタを乗せたときの強調は、描いていない線（ツリーの子どうし）をたどらない", () => {
  const { el } = setup({
    nodes: [
      { id: 1, caption: "親", childView: "tree", x: 40, y: 40 },
      { id: 2, caption: "子A", parent: 1 }, { id: 3, caption: "子B", parent: 1 },
      { id: 4, caption: "外", x: 600, y: 40 }, { id: 5, caption: "相手", x: 600, y: 300 },
    ],
    edges: [[2, 3], [4, 5]],
  });
  const node = (id: number) => el.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!;
  const hover = (id: number) => node(id).querySelector(".mz-head")!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  hover(2);
  expect(node(3).classList.contains("mz-dim")).toBe(true); // 子A と子B の線は描かないので、子B は明るくしない
  hover(4);
  expect(node(5).classList.contains("mz-dim")).toBe(false); // 見えている線の相手は明るくする
});
