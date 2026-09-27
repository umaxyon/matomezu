import { afterEach, describe, expect, test } from "bun:test";
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
    expect(graph.info(1)).toMatchObject({ caption: "b", color: "#ffffff" });
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
    const click = (id: number) => {
      graph.select(id);
      el.querySelector(".mz-node.mz-current > .mz-head")!
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ctrlKey: true, pointerId: 1 }));
    };
    click(1); click(2);
    el.querySelector(".mz-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

  test("load は履歴を空にし、keepHistory なら1件足す", () => {
    const { graph } = setup({ nodes: [{ id: 1, caption: "a" }] });
    graph.load({ nodes: [{ id: 1, caption: "外部の変更" }] }, { keepHistory: true });
    graph.undo();
    expect(graph.info(1).caption).toBe("a");

    graph.load({ nodes: [{ id: 1, caption: "開き直し" }] });
    expect(graph.history()).toEqual({ canUndo: false, canRedo: false });
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
    const { graph } = setup(sample(), { onNotice: (t: string) => notices.push(t) });
    expect(graph.reparent(4, 2, { x: 900, y: 40 })).toBe(true); // 子を内包する先では at は使わない
    const out = graph.toJSON();
    expect(parentOf(out, 4)).toBe(2);
    expect([parentOf(out, 5), parentOf(out, 6)]).toEqual([4, 4]); // 子孫はそのまま
    // バックエンドとフロントエンド・外部サービスの線は外れ、API-データの線は残る
    expect(out.edges).toEqual([{ id: "e3", from: 5, to: 6 }]);
    expect(notices.at(-1)).toBe("「Web」の中へ移しました（階層が変わったため、線を 2 本外しました）");
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
  // id のボックスを dx, dy だけ、何回かに分けてドラッグする
  function dragBy(el: HTMLElement, graph: Graph, id: number, dx: number, dy: number) {
    graph.select(id);
    const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    for (let i = 1; i <= 10; i++) fire("pointermove", (dx * i) / 10, (dy * i) / 10);
    fire("pointerup", dx, dy);
  }
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

  test("押しのけると横にはみ出す場合は、今までどおり止める", () => {
    const { el, graph } = setup(group([{ id: 9, caption: "右端", x: 860, y: 40 }]));
    const before = byId(graph.toJSON(), 2).x;
    dragBy(el, graph, 2, 900, 0);
    const g = graph.info(1), r = graph.info(9);
    expect(r.x).toBe(860);
    expect(g.x + g.w).toBeLessThanOrEqual(r.x); // グループは右端のボックスの手前で止まる
    expect(byId(graph.toJSON(), 2).x).toBeGreaterThan(before!);
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
        { id: 3, caption: "とても長いキャプションの入ったボックス", parent: 1, overflow: "grow" },
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
    const { graph } = setup(data(), { onNotice: (t: string) => notices.push(t) });
    expect((graph.info(1) as import("../web/src/types").BoxInfo).sizableChildren).toBe(2);
    const s = graph.info(4).w;
    expect(graph.fitChildren(1, "width")).toBe(2);
    // API は中の2つが横に並ぶので 12+120+8+120+12 = 272 より小さくできない。広げてあったデータ（400）も 272 に縮む
    expect([graph.info(2).w, graph.info(3).w]).toEqual([272, 272]);
    expect(graph.info(4).w).toBe(s);
    expect(byId(graph.toJSON(), 3).width).toBe(272); // 保存される
    expect(notices.at(-1)).toBe("子 2 個の幅をそろえました");
  });

  test("高さと両方。広がってぶつかる子はずらし、Undo 1回で戻る", () => {
    const { graph } = setup(data());
    const before = graph.toJSON();
    graph.fitChildren(1, "both");
    const a = graph.info(2), d = graph.info(3);
    expect(a.w).toBe(d.w);
    expect(a.h).toBe(d.h);
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

describe("中身をドラッグしたら親が追従する", () => {
  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "API", x: 40, y: 40, width: 400, height: 150 }, // そろえた後のように最小の大きさが付いている
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

  test("子を内側へ動かすと、最小の大きさを外して縮む。Undo で戻る", () => {
    const { el, graph } = setup(data());
    expect(graph.info(1).w).toBe(400);
    press(el, graph, 3, [[-40, 0], [-80, 0], [-120, 0]]);
    // 注文は x=140 まで動き、API は中身（140 + 120 + 余白 12）に合わせて縮む
    expect(byId(graph.toJSON(), 3).x).toBe(140);
    expect(graph.info(1).w).toBe(272);
    expect(graph.info(1).h).toBe(30 + 64 + 12);
    expect("width" in byId(graph.toJSON(), 1)).toBe(false);
    graph.undo();
    expect([byId(graph.toJSON(), 1).width, graph.info(1).w]).toEqual([400, 400]);
  });

  test("つかんだだけで動かさなければ、何も変えない", () => {
    const { el, graph } = setup(data());
    press(el, graph, 3, [[0, 0]]);
    expect([byId(graph.toJSON(), 1).width, graph.info(1).w]).toEqual([400, 400]);
    expect(graph.history().canUndo).toBe(false);
  });

  test("幅に合わせて折り返すグループの大きさは外さない", () => {
    const d = data();
    byId(d, 1).overflow = "wrap";
    const { el, graph } = setup(d);
    press(el, graph, 3, [[-40, 0], [-80, 0]]);
    expect(graph.info(1).w).toBe(400);
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
  }, { onNotice: (t: string) => notices.push(t) });
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
  graph.update(1, { size: "L" }); // 今と同じサイズでも戻す
  const out = byId(graph.toJSON(), 1);
  expect(["width" in out, "height" in out]).toEqual([false, false]);
  expect([graph.info(1).w, graph.info(1).h]).toEqual([120, 64]);
  graph.undo();
  expect(graph.info(1).w).toBe(312);
});

describe("子の見せ方を変えても本体の中心を保つ", () => {
  // 本体の中心（ワールドでの位置）
  function headCenter(el: HTMLElement, graph: Graph, id: number) {
    graph.select(id);
    const node = el.querySelector(".mz-node.mz-current") as HTMLElement;
    const head = node.querySelector(":scope > .mz-head") as HTMLElement;
    let x = parseFloat(head.style.left) + parseFloat(head.style.width) / 2;
    let y = parseFloat(head.style.top) + parseFloat(head.style.height) / 2;
    for (let m: HTMLElement | null = node; m && m.classList.contains("mz-node"); m = m.parentElement) {
      x += parseFloat(m.style.left);
      y += parseFloat(m.style.top);
    }
    return [x, y];
  }
  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "外部サービス", childView: "tree", treeDirection: "right", x: 300, y: 200 },
      { id: 2, caption: "決済", parent: 1 }, { id: 3, caption: "メール配信", parent: 1 },
      { id: 9, caption: "下の箱", x: 300, y: 420 },
    ],
  } as Diagram);

  test.each([
    ["ツリー → 非表示", { childView: "hidden" }],
    ["ツリー → 内包", { childView: "nest" }],
    ["ツリーの向き 右 → 下", { treeDirection: "down" }],
    ["ツリーの向き 右 → 左", { treeDirection: "left" }],
  ] as const)("%s", (_, patch) => {
    const { el, graph } = setup(data());
    const before = headCenter(el, graph, 1);
    graph.update(1, patch);
    const after = headCenter(el, graph, 1);
    expect(after[0]).toBeCloseTo(before[0]!);
    expect(after[1]).toBeCloseTo(before[1]!);
    // 広がってもほかのボックスとは重ならない（相手の方がずれる）
    const a = graph.info(1), b = graph.info(9);
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  });

  test("非表示 → ツリーに戻しても中心を保つ", () => {
    const { el, graph } = setup(data());
    graph.update(1, { childView: "hidden" });
    const before = headCenter(el, graph, 1);
    graph.update(1, { childView: "tree" });
    const after = headCenter(el, graph, 1);
    expect(after[0]).toBeCloseTo(before[0]!);
    expect(after[1]).toBeCloseTo(before[1]!);
  });

  test("入れ子の中でも、変えたボックスはその場に残り、ぶつかる兄弟が下へずれる", () => {
    const { el, graph } = setup({
      nodes: [
        { id: 1, caption: "枠", x: 40, y: 40 },
        // 親の端から離しておく（端に接していると、ツリーの外枠が親からはみ出さないよう戻される）
        { id: 2, caption: "外部", parent: 1, childView: "hidden", x: 200, y: 60 },
        { id: 21, caption: "決済", parent: 2 }, { id: 22, caption: "メール", parent: 2 },
        { id: 3, caption: "兄弟", parent: 1, x: 12, y: 150 },
      ],
    });
    const before = headCenter(el, graph, 2);
    graph.update(2, { childView: "tree" });
    const after = headCenter(el, graph, 2);
    expect(after[0]).toBeCloseTo(before[0]!);
    expect(after[1]).toBeCloseTo(before[1]!);
    const a = graph.info(2), b = graph.info(3);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect(b.x).toBe(12);
  });
});

test("見せ方を変えて広がったボックスが大きい隣にぶつかったら、自分の方が少しずれる", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, caption: "フロントエンド", x: 40, y: 40, width: 500, height: 400 }, // 大きい隣
      { id: 2, caption: "外部サービス", childView: "hidden", x: 560, y: 200 },
      { id: 21, caption: "決済", parent: 2 }, { id: 22, caption: "メール配信", parent: 2 },
    ],
  });
  const big = graph.info(1);
  graph.update(2, { childView: "nest" }); // 中心から左右に広がり、左の大きい隣に重なる
  const after = graph.info(1), ext = graph.info(2);
  expect([after.x, after.y]).toEqual([big.x, big.y]); // 大きい隣は動かない
  expect(ext.x).toBeGreaterThanOrEqual(after.x + after.w); // 自分が右へずれる
  expect(ext.y + ext.h / 2).toBeCloseTo(200 + 32); // 縦の中心は保つ
});

test.each([
  ["サイズ L → S", { size: "S" }],
  ["形をスティックマンに", { shape: "person" }],
  ["キャプションを長く", { caption: "とても長いキャプションに書き換えて大きさが変わる" }],
] as const)("設定を変えて大きさが変わっても、本体の中心を保つ: %s", (_, patch) => {
  const { graph } = setup({ nodes: [{ id: 1, caption: "外部サービス", x: 300, y: 200 }, { id: 2, x: 40, y: 40 }] });
  const center = () => { const i = graph.info(1); return [i.x + i.w / 2, i.y + i.h / 2]; };
  const before = center();
  graph.update(1, patch);
  const after = center();
  // info() は整数に丸めるので、1px までの差は許す
  expect(Math.abs(after[0]! - before[0]!)).toBeLessThanOrEqual(1);
  expect(Math.abs(after[1]! - before[1]!)).toBeLessThanOrEqual(1);
});

test("つながる相手が片側にだけいれば、その側の辺を動かさない（線の長さと角度を保つ）", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, caption: "フロントエンド", x: 40, y: 40, width: 400, height: 400 },
      { id: 2, caption: "外部サービス", childView: "hidden", x: 560, y: 200 },
      { id: 21, caption: "決済", parent: 2 }, { id: 22, caption: "メール配信", parent: 2 },
    ],
    edges: [[1, 2]],
  });
  const before = graph.info(2);
  graph.update(2, { childView: "nest" });
  const after = graph.info(2);
  expect(after.x).toBe(before.x); // 左（相手の側）の辺はそのまま、右へ広がる
  expect(after.w).toBeGreaterThan(before.w);
  expect(Math.abs(after.y + after.h / 2 - (before.y + before.h / 2))).toBeLessThanOrEqual(1); // 縦は中心
  graph.update(2, { size: "S" }); // 内包のままサイズを変えても左辺は同じ
  expect(graph.info(2).x).toBe(before.x);
});

test("はみ出しの調整は最初に開いたときだけで、外部の変更の読み直しでは行わない", () => {
  const data = (caption: string): Diagram => ({
    nodes: [{ id: 1, caption: "相手", x: 40, y: 40 }, { id: 2, caption, x: 900, y: 40 }],
    edges: [[1, 2]],
  });
  const { graph } = setup(data("右端"));
  expect(graph.info(2).x).not.toBe(900); // 最初に開いたときは下へ移す
  graph.load(data("LLM が書き換えた"), { keepHistory: true });
  expect([graph.info(2).x, graph.info(2).y]).toEqual([900, 40]); // ファイルの位置のまま
  graph.load(data("開き直し"));
  expect(graph.info(2).x).not.toBe(900);
});
