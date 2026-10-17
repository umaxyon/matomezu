// 差分（diff.ts）と履歴（history.ts）。D31。history.test.ts は代表の筋書きを見る。
// ここは差分の種類ごと（箱・線・ページ・消した箱・world・最上位の項目・並び順）に、進めて戻すと元に戻ること、
// 当てる相手が無いときに飛ばすこと、履歴の件数の上限や Redo の残りの扱いを確かめる
import { describe, expect, test } from "bun:test";
import { type Change, applyChanges, diffData, touchedOf } from "../web/src/diff";
import { createHistory } from "../web/src/history";
import type { Diagram } from "../web/src/types";

const base = (): Diagram => ({
  world: { title: "題", background: "#fff" },
  nodes: [{ id: 1, caption: "A", x: 0 }, { id: 2, caption: "B", parent: 1 }, { id: 3, caption: "C" }],
  edges: [{ id: "e1", from: 1, to: 3 }, [2, 2]],
  pages: [{ id: "p2", title: "二" }],
  removed: [{ id: 9, caption: "消" }],
});
const edit = (f: (d: Diagram) => void): Diagram => { const d = base(); f(d); return d; };
const kinds = (ops: Change[]) => ops.map(c => `${c.kind}:${c.op}:${c.key}`);

// 1 つの操作の前後。差分の種類と、進めて戻すと元に戻ること
const cases: [string, Diagram, string[]][] = [
  ["箱の項目を変える・足す・消す", edit(d => { d.nodes[0]!.caption = "A2"; d.nodes[0]!.y = 5; delete d.nodes[0]!.x; }), ["node:change:1"]],
  ["箱を足す（間に）", edit(d => { d.nodes.splice(1, 0, { id: 4, caption: "新" }); }), ["node:add:4"]],
  ["箱を消す（つながる線も）", edit(d => { d.nodes.splice(2, 1); d.edges!.splice(0, 1); }), ["node:remove:3", "edge:remove:e1"]],
  ["箱の並び順を変える", edit(d => { d.nodes.reverse(); }), ["order:order:nodes"]],
  ["id のある線を変える", edit(d => { (d.edges![0] as { caption?: string }).caption = "呼ぶ"; }), ["edge:change:e1"]],
  ["配列の線を消す", edit(d => { d.edges!.splice(1, 1); }), ["edge:remove:2>2"]],
  ["id の無い線を足す", edit(d => { d.edges!.push({ from: 3, to: 1 }); }), ["edge:add:3>1"]],
  ["ページの題名を変える", edit(d => { d.pages![0]!.title = "三"; }), ["page:change:p2"]],
  ["ページを足す", edit(d => { d.pages!.push({ id: "p3" }); }), ["page:add:p3"]],
  ["消した箱が増える", edit(d => { d.removed!.push({ id: 10 }); }), ["removed:add:10"]],
  ["world の項目を変えて消す", edit(d => { d.world!.title = "別"; delete d.world!.background; }), ["world:change:"]],
];

describe("diffData と applyChanges: 種類ごとに、進めると後の状態、戻すと前の状態（項目の並びも）", () => {
  test.each(cases)("%s", (_, after, want) => {
    const ops = diffData(base(), after);
    expect(kinds(ops)).toEqual(want);
    expect(JSON.stringify(applyChanges(base(), ops, "redo"))).toBe(JSON.stringify(after));
    expect(JSON.stringify(applyChanges(after, ops, "undo"))).toBe(JSON.stringify(base()));
  });

  test("最上位の項目（world・nodes などの外）を足して戻す", () => {
    const after = edit(d => { (d as unknown as Record<string, unknown>).version = 2; });
    const ops = diffData(base(), after);
    expect(kinds(ops)).toEqual(["top:change:", "keys:order:"]); // 項目の並びも 1 件（並びを当てる側にそろえる）
    expect(applyChanges(base(), ops, "redo")).toEqual(after);
    expect(JSON.stringify(applyChanges(after, ops, "undo"))).toBe(JSON.stringify(base()));
  });

  // 最上位の項目の並びも、進めた後の状態と同じにする（formatDiagram は並びどおりに書くので、Redo のたびにファイルの行が動いていた。
  // 2026-10-17 のテストの見直しで見つけた X8）
  test("最上位の項目を足す操作を Redo しても、ファイルの項目の並びが変わらない", () => {
    const after = edit(d => { (d as unknown as Record<string, unknown>).version = 2; });
    expect(JSON.stringify(applyChanges(base(), diffData(base(), after), "redo"))).toBe(JSON.stringify(after));
  });

  // 空になった一覧は項目ごと無くす（edits.ts の restoreSubtree・purgeRemoved は空なら項目を消す）。Undo / Redo のあとに removed: [] や
  // edges: [] が残っていた（2026-10-17 のテストの見直しで見つけた X8）
  test("空になった一覧は、Redo / Undo のあとも項目ごと無い", () => {
    const after = edit(d => { delete d.removed; });
    expect(applyChanges(base(), diffData(base(), after), "redo")).toEqual(after);
    const noEdges: Diagram = { nodes: [{ id: 1 }] };
    const withEdge: Diagram = { nodes: [{ id: 1 }], edges: [[1, 1]] };
    expect(applyChanges(withEdge, diffData(noEdges, withEdge), "undo")).toEqual(noEdges);
  });

  test("同じなら差分は無い。applyChanges は渡したデータを書き換えない", () => {
    expect(diffData(base(), base())).toEqual([]);
    const now = base();
    const ops = diffData(base(), edit(d => { d.nodes[0]!.caption = "X"; d.nodes.push({ id: 5 }); }));
    applyChanges(now, ops, "redo");
    expect(now).toEqual(base());
  });

  test("消した箱を戻すと、消す前の位置に入る（後から足された箱があってもその前後を崩さない）", () => {
    const after = edit(d => { d.nodes.splice(0, 1); });
    const ops = diffData(base(), after);
    const later = { ...after, nodes: [...after.nodes, { id: 7 }] };
    expect(applyChanges(later, ops, "undo").nodes.map(n => n.id)).toEqual([1, 2, 3, 7]);
  });

  test("当てる相手が無い差分は飛ばす（後から消えた箱の変更を戻す・もうある箱を足し直す）", () => {
    const ops = diffData(base(), edit(d => { d.nodes[2]!.caption = "C2"; d.nodes.push({ id: 4 }); }));
    const gone = edit(d => { d.nodes.splice(2, 1); });
    expect(applyChanges(gone, ops, "undo").nodes.map(n => n.id)).toEqual([1, 2]);
    const has4 = edit(d => { d.nodes.push({ id: 4, caption: "LLM" }); });
    const re = applyChanges(has4, ops, "redo");
    expect(re.nodes.filter(n => n.id === 4)).toEqual([{ id: 4, caption: "LLM" }]);
  });

  test("いくつもの操作をまとめた差分も、戻すと元どおり（足した箱の線と、変えた world を含む）", () => {
    const after = edit(d => {
      d.nodes.push({ id: 4, parent: 3 });
      d.edges!.push({ id: "e2", from: 3, to: 1 });
      d.nodes[0]!.caption = "A'";
      d.world!.theme = "x";
      d.pages = [];
      d.removed!.splice(0, 1);
    });
    const ops = diffData(base(), after);
    expect(JSON.stringify(applyChanges(after, ops, "undo"))).toBe(JSON.stringify(base()));
    expect(JSON.stringify(applyChanges(base(), ops, "redo"))).toBe(JSON.stringify(after));
  });
});

test("touchedOf: 触った箱（線は両端）・消した箱・ページ（world は最初のページ）・最上位の項目", () => {
  const after = edit(d => {
    d.nodes[0]!.caption = "x";
    d.nodes.splice(2, 1, { id: 4 });
    d.edges = [[2, 1] as [number, number]];
    d.pages![0]!.title = "x";
    d.world!.title = "x";
    (d as unknown as Record<string, unknown>).version = 1;
  });
  const t = touchedOf(diffData(base(), after));
  expect([...t.nodes].sort()).toEqual(["1", "2", "3", "4"]);
  expect([...t.removed.keys()]).toEqual(["3"]);
  expect(t.removed.get("3")).toEqual({ id: 3, caption: "C" });
  expect([...t.pages]).toEqual(["p2", null]);
  expect(t.whole).toBe(true);
  expect(touchedOf([]).whole).toBe(false);
});

describe("createHistory", () => {
  function setup(limit = 100) {
    let data: Diagram = { nodes: [{ id: 1, caption: "" }] };
    let clock = 0;
    const states: string[] = [];
    const H = createHistory({
      snapshot: () => JSON.parse(JSON.stringify(data)), apply: d => { data = d; }, limit, now: () => ++clock,
      onHistory: s => states.push(`${+s.canUndo}${+s.canRedo}`),
    });
    H.reset();
    const set = (c: string) => { data = { nodes: [{ id: 1, caption: c }] }; };
    const user = (c: string) => { set(c); H.record(); };
    return { H, set, user, cap: () => data.nodes[0]!.caption, states };
  }

  test("戻すものも進めるものも無ければ false を返し、何もしない", () => {
    const { H, cap, states } = setup();
    expect([H.undo(), H.redo(), cap()]).toEqual([false, false, ""]);
    expect(states).toEqual(["00"]); // reset の知らせだけ
  });

  test("変わっていない記録は積まない。そのとき Redo の残りも消さない", () => {
    const { H, user, cap } = setup();
    user("a");
    H.undo();
    H.record();
    expect(H.state()).toEqual({ canUndo: false, canRedo: true });
    H.redo();
    expect(cap()).toBe("a");
  });

  test("新しい操作を積むと Redo の残りは消える", () => {
    const { H, user } = setup();
    user("a"); user("b");
    H.undo();
    user("c");
    expect(H.state()).toEqual({ canUndo: true, canRedo: false });
  });

  test("件数の上限を超えたら古いものから捨てる（LLM の変更の差し込みでも）", () => {
    const { H, set, user, cap } = setup(2);
    user("a"); user("b"); user("c");
    while (H.undo());
    expect(cap()).toBe("a"); // 最初の操作（"" → "a"）は捨てた
    while (H.redo());
    set("L");
    H.adopt(H.external()!);
    while (H.undo());
    expect(cap()).toBe("b");
  });

  test("external は変わっていなければ null。差分のもと（last）を進め、次の操作に LLM の変更を混ぜない", () => {
    const { H, set, user, cap } = setup();
    expect(H.external()).toBeNull();
    set("L");
    const op = H.external()!;
    expect(H.last().nodes[0]!.caption).toBe("L");
    user("U");
    H.undo();
    expect(cap()).toBe("L"); // 戻しても LLM の変更は残る（認知していない）
    expect(op.changes.length).toBe(1);
  });

  test("ユーザーのどの操作より前の時刻の LLM の変更は、一番古い位置に差し込む", () => {
    const { H, set, user, cap } = setup();
    set("L");
    const l = H.external()!; // 時刻 1
    user("U1"); user("U2");
    H.adopt(l);
    H.undo(); H.undo();
    expect(cap()).toBe("L");
    H.undo();
    expect(cap()).toBe("");
    expect(H.undo()).toBe(false);
  });
});
