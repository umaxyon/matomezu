// edits.ts のテスト。ブックのデータを直す関数（付け替え・消す・戻す・移植）を、図を作らずに確かめる
import { expect, test } from "bun:test";
import { moveSubtree, pasteSubtree, removeSubtree, restoreSubtree } from "../web/src/edits";
import type { Diagram, EdgeData } from "../web/src/types";

// 1 は 2 と 3 を内包し、2 は 4 を持つ。5 は最上位。線は 1-5 と 2-3
const data = (): Diagram => ({
  nodes: [
    { id: 1, caption: "親", x: 10, y: 10 },
    { id: 2, caption: "子A", parent: 1, x: 12, y: 30 },
    { id: 3, caption: "子B", parent: 1, x: 140, y: 30 },
    { id: 4, caption: "孫", parent: 2 },
    { id: 5, caption: "隣", x: 400, y: 10 },
  ],
  edges: [{ id: "e1", from: 1, to: 5 }, { id: "e2", from: 2, to: 3 }],
});
const edgeIds = (d: Diagram) => (d.edges as EdgeData[]).map(e => e.id);

test("moveSubtree は親と位置を変え、同じ親でなくなった線を外す。自分の子孫の中へは移せない", () => {
  const d = data();
  expect(moveSubtree(d, 2, undefined, { x: 300.4, y: 200.6 })).toBe(1);
  expect(d.nodes[1]).toMatchObject({ id: 2, x: 300, y: 201 });
  expect(d.nodes[1]!.parent).toBeUndefined();
  expect(edgeIds(d)).toEqual(["e1"]);
  expect(moveSubtree(d, 5, 1, null)).toBe(1); // 1-5 は親子になったので外れる
  expect(d.nodes[4]!.x).toBeUndefined();
  expect(() => moveSubtree(data(), 1, 4, null)).toThrow("自分や自分の子孫");
});

test("removeSubtree は子孫ごと removed の末尾へ移し、つながっていた線も消す", () => {
  const d = data();
  const r = removeSubtree(d, 2);
  expect([...r.ids].sort()).toEqual(["2", "4"]);
  expect(r.cut).toBe(1);
  expect(d.nodes.map(n => n.id)).toEqual([1, 3, 5]);
  expect(d.removed!.map(n => n.id)).toEqual([2, 4]);
  expect(edgeIds(d)).toEqual(["e1"]);
});

test("restoreSubtree は removed の中の子孫ごと戻し、空になった removed は消す", () => {
  const d = data();
  removeSubtree(d, 2);
  restoreSubtree(d, 2, 5, null);
  expect(d.nodes.map(n => [n.id, n.parent])).toEqual([[1, undefined], [3, 1], [5, undefined], [2, 5], [4, 2]]);
  expect(d.removed).toBeUndefined();
  expect(() => restoreSubtree(d, 2, undefined, null)).toThrow("消したボックスにありません");
});

test("pasteSubtree は id と線の id を空いている番号に振り直し、stripPages なら page と world を外す", () => {
  const d = data();
  removeSubtree(d, 5); // 消したものの id（5）も使わない
  const copy = {
    root: "1",
    nodes: [{ id: 1, caption: "外", page: true, world: { background: "#000" } }, { id: 2, caption: "外の子", parent: 1 }, { id: 3, parent: 1 }],
    edges: [{ id: "e9", from: 2, to: 3 }],
  };
  const r = pasteSubtree(d, copy, 3, { x: 1, y: 2 }, true);
  expect(r).toEqual({ root: "6", nodes: 3, edges: 1 });
  expect(d.nodes.slice(-3)).toEqual([
    { id: 6, caption: "外", parent: 3, x: 1, y: 2 },
    { id: 7, caption: "外の子", parent: 6 },
    { id: 8, parent: 6 },
  ]);
  expect((d.edges as EdgeData[]).at(-1)).toEqual({ id: "e1", from: 7, to: 8 }); // e1 は 5 と一緒に消えて空いた
});
