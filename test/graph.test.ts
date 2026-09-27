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
