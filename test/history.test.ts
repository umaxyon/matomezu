// 履歴（D31。2026-10-15 ユーザー）: ユーザーの操作だけを差分で積み、認知した LLM の変更は時刻の位置に差し込む
import { expect, test } from "bun:test";
import { createHistory } from "../web/src/history";
import { applyChanges, diffData } from "../web/src/diff";
import type { Diagram } from "../web/src/types";

function setup() {
  let data: Diagram = { nodes: [{ id: 1, caption: "" }, { id: 2, caption: "" }] };
  let clock = 0;
  const H = createHistory({ snapshot: () => JSON.parse(JSON.stringify(data)), apply: d => { data = d; }, limit: 100, now: () => ++clock });
  H.reset();
  const set = (id: number, caption: string) => { data = { ...data, nodes: data.nodes.map(n => (n.id === id ? { ...n, caption } : n)) }; };
  const user = (id: number, c: string) => { set(id, c); H.record(); };
  const caps = () => data.nodes.map(n => n.caption);
  return { H, set, user, caps, tick: () => ++clock };
}

test("U1 U2 U3 L1 → Undo（U3 だけ戻す。L1 は残る）→ L1 を認知（今の位置に入る）→ Redo（U3 が戻る）", () => {
  const { H, set, user, caps } = setup();
  user(1, "U1"); user(1, "U2"); user(2, "U3");
  set(1, "L1");
  const l1 = H.external()!;
  expect(caps()).toEqual(["L1", "U3"]);
  H.undo();
  expect(caps()).toEqual(["L1", ""]);
  H.adopt(l1); // L1 の時刻は U3 より後で、U3 は戻した側なので、今の位置（U2 の後）に入る。Redo の残りは消さない
  expect(H.state()).toEqual({ canUndo: true, canRedo: true });
  H.redo();
  expect(caps()).toEqual(["L1", "U3"]);
  H.undo(); H.undo(); // U3、L1 の順に戻る
  expect(caps()).toEqual(["U2", ""]);
});

test("認知した LLM の変更は、まだ戻していない操作の中の時刻の位置に差し込む", () => {
  const { H, set, user, caps } = setup();
  user(1, "U1");
  set(2, "L1");
  const l1 = H.external()!; // U1 と U2 の間の時刻
  user(1, "U2");
  H.adopt(l1);
  H.undo(); // U2
  expect(caps()).toEqual(["U1", "L1"]);
  H.undo(); // L1
  expect(caps()).toEqual(["U1", ""]);
});

test("差分: 戻すと前の値（後から変えられていても上書き）。足した箱は子孫とつながる線ごと消す", () => {
  const a: Diagram = { nodes: [{ id: 1, caption: "A", x: 0 }], edges: [] };
  const b: Diagram = { nodes: [{ id: 1, caption: "A", x: 100 }, { id: 2, caption: "足した" }], edges: [{ id: "e1", from: 1, to: 2 }] };
  const ops = diffData(a, b);
  const later: Diagram = { nodes: [{ id: 1, caption: "A", x: 300 }, { id: 2, caption: "足した" }, { id: 3, caption: "子", parent: 2 }], edges: [{ id: "e1", from: 1, to: 2 }] };
  const back = applyChanges(later, ops, "undo");
  expect(back.nodes).toEqual([{ id: 1, caption: "A", x: 0 }]);
  expect(back.edges).toEqual([]);
  expect(applyChanges(back, ops, "redo")).toEqual(b);
});
