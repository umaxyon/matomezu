// ボックスの削除と復活（docs/DELETE-plan.md）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph, type GraphOptions } from "../web/src/graph";
import type { BoxData, BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure, PLAIN_GAPS, violations } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram, o: GraphOptions = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure, ...PLAIN_GAPS, ...o });
  graphs.push(graph);
  return { el, graph };
}

// 1 は 2 と 3 を内包するグループ。4 は右、5 は下。線は 1-4 と 2-3
const data = (): Diagram => ({
  world: { width: 1000 },
  nodes: [
    { id: 1, caption: "親", x: 40, y: 40 },
    { id: 2, caption: "左", parent: 1, x: 12, y: 30 },
    { id: 3, caption: "右", parent: 1, x: 140, y: 30 },
    { id: 4, caption: "隣", x: 400, y: 40 },
    { id: 5, caption: "下", x: 40, y: 200 },
  ],
  edges: [[1, 4], [2, 3]],
});
const ids = (list: BoxData[] | undefined) => (list ?? []).map(n => n.id);
const removed = (g: Graph) => g.toJSON().removed as BoxData[] | undefined;
const at = (g: Graph, id: number) => [g.info(id).x, g.info(id).y];

test("親を消すと子孫も消え、消す直前の親子関係と位置を removed に残す。つながっていた線は消える", () => {
  const { el, graph } = setup(data());
  expect(graph.remove(1)).toBe(true);
  const out = graph.toJSON();
  expect(ids(out.nodes)).toEqual([4, 5]);
  expect(removed(graph)!.map(n => [n.id, n.parent, n.x, n.y])).toEqual([
    [1, undefined, 40, 40], [2, 1, 12, 30], [3, 1, 140, 30],
  ]);
  expect(out.edges).toEqual([]);
  expect(el.querySelector('[data-id="2"]')).toBeNull();
  expect(violations(el)).toEqual([]);
});

test("Undo で線ごと戻り、Redo でまた消える", () => {
  const { graph } = setup(data());
  graph.remove(1);
  graph.undo();
  expect(ids(graph.toJSON().nodes)).toEqual([1, 2, 3, 4, 5]);
  expect(graph.toJSON().edges!.length).toBe(2);
  expect(removed(graph) ?? []).toEqual([]);
  graph.redo();
  expect(ids(graph.toJSON().nodes)).toEqual([4, 5]);
});

test("子を消すと親は縮む。残った子は動かず、真ん中の穴はそのまま", () => {
  const { graph } = setup(data());
  expect(graph.info(1).w).toBe(272);
  graph.remove(3); // 右の子
  expect(graph.info(1).w).toBe(144);
  expect(at(graph, 2)).toEqual([12, 30]);
  graph.undo();
  graph.remove(2); // 左の子
  expect(at(graph, 3)).toEqual([140, 30]);
  expect(graph.info(1).w).toBe(272);
});

test("親が縮むと、押し下げていた下の箱は元の高さへ戻る", () => {
  const { graph } = setup({
    world: { width: 1000 },
    nodes: [
      { id: 1, caption: "親", x: 40, y: 40 },
      { id: 2, caption: "上", parent: 1, x: 12, y: 30 },
      { id: 5, caption: "下", x: 40, y: 160 }, // 親の下端 146 から 8px 以上離す
    ],
  });
  graph.update(2, { caption: "とても長いキャプションが入ったボックスの例です。".repeat(4) }); // 親が下へ伸び、5 を押し下げる
  const pushed = graph.info(5).y;
  expect(pushed).toBeGreaterThan(160);
  graph.remove(2);
  expect(graph.info(5).y).toBe(160);
});

test("親の大きさは子の並びで決まり（大きさの指定は使わない）、子を消せば縮む", () => {
  const d = data();
  Object.assign(d.nodes[0]!, { width: 400, height: 200, fixedWidth: true, fixedHeight: true });
  const { graph } = setup(d);
  expect(graph.info(1).w).toBe(272);
  graph.remove(3);
  expect(graph.info(1).w).toBe(144);
  // 固定の印は残す（子を全部外して葉に戻れば効く）。width は今の大きさ（D44 の段階 3）
  expect([graph.toJSON().nodes[0]!.fixedWidth, graph.toJSON().nodes[0]!.width]).toEqual([true, 144]);
});

test("消したボックスの id は再利用しない", () => {
  const { graph } = setup(data());
  graph.remove(5);
  const d = graph.toJSON();
  d.nodes.push({ caption: "新しい" }); // id を省いて読み込む
  graph.load(d);
  expect(graph.toJSON().nodes.at(-1)!.id).toBe(6);
});

test("removed の id が nodes と重なっていれば読み込みエラー", () => {
  const { graph } = setup(data());
  expect(() => graph.load({ nodes: [{ id: 1 }], removed: [{ id: 1 }] })).toThrow("id が重複");
});

test("ワールドへ戻すと、子孫も入れ子と位置のまま戻る。線は戻らない", () => {
  const { el, graph } = setup(data());
  graph.remove(1);
  expect(graph.restore(1, null, { x: 600, y: 300 })).toBe(true);
  const out = graph.toJSON();
  expect(ids(out.nodes)).toEqual([4, 5, 1, 2, 3]);
  expect(out.nodes.map(n => [n.id, n.parent, n.x, n.y])).toEqual([
    [4, undefined, 400, 40], [5, undefined, 40, 200], [1, undefined, 600, 300], [2, 1, 12, 30], [3, 1, 140, 30],
  ]);
  expect(out.edges).toEqual([]);
  expect(removed(graph) ?? []).toEqual([]);
  expect(violations(el)).toEqual([]);
});

test("親ごと消えた子だけを、別のグループへ先に戻せる", () => {
  const { el, graph } = setup(data());
  graph.remove(1);
  graph.restore(3, 4, { x: 12, y: 30 }); // 4 の中へ
  expect((graph.info(3) as BoxInfo).parent).toEqual({ id: "4", caption: "隣" });
  expect(ids(removed(graph))).toEqual([1, 2]);
  expect(violations(el)).toEqual([]);
});

test("戻した位置でぶつかったら、戻した箱の方が近くの空きへずれる（今ある箱は動かさない。docs/PAPER-plan.md の 4.6）", () => {
  const { el, graph } = setup(data());
  graph.remove(5);
  graph.restore(5, null, { x: 400, y: 40 }); // 4 と同じ位置
  expect(at(graph, 4)).toEqual([400, 40]);
  expect(at(graph, 5)).not.toEqual([400, 40]);
  expect(violations(el)).toEqual([]);
  // Undo 1 回で消した状態に戻る
  graph.undo();
  expect(ids(removed(graph))).toEqual([5]);
  expect(at(graph, 4)).toEqual([400, 40]);
});

test("選択中のボックスを消すと、ワールドの選択に戻る", () => {
  const { graph } = setup(data());
  graph.select(2);
  graph.remove(1);
  expect(graph.selected()).toBeNull();
});

test("一覧: 表示中と消したものを、親の名前と一緒に返す", () => {
  const { graph } = setup(data());
  graph.remove(1);
  const list = graph.items();
  expect(list.live.map(i => [i.id, i.caption, i.parent])).toEqual([["4", "隣", null], ["5", "下", null]]);
  expect(list.removed.map(i => [i.id, i.caption, i.parent])).toEqual([["1", "親", null], ["2", "左", "親"], ["3", "右", "親"]]);
});

test("マスター（STRATEGIES の items が books）: 窓を消すと一覧から外す知らせだけ出し、図からは消さない。窓でない箱は消せない。窓は設定を持たない", () => {
  const removed: string[] = [];
  const data: Diagram = { world: { childView: "master" }, nodes: [{ id: "user", caption: "ユーザー", childView: "list" }, { id: "b-x", parent: "user", caption: "x", book: "x" }], edges: [] } as never;
  const { graph } = setup(data, { onRemoveBook: b => removed.push(b) });
  expect([graph.canRemove("b-x"), graph.canRemove("user")]).toEqual([true, false]);
  expect(graph.remove("b-x")).toBe(false);
  expect(graph.remove("user")).toBe(false);
  expect(removed).toEqual(["x"]);
  expect(graph.toJSON().nodes.map(n => n.id)).toEqual(["user", "b-x"]);
  expect([graph.hasSettings("b-x"), graph.hasSettings("user")]).toEqual([false, true]);
  // 外す先が無ければ（サーバーなし）窓も消せない
  const { graph: alone } = setup(data);
  expect(alone.canRemove("b-x")).toBe(false);
});

test("ふつうのページ（items が boxes）: 消せるのはツリーの根でない箱。設定は箱の編集のまま", () => {
  const { graph } = setup({ world: { childView: "tree", root: 1 }, nodes: [{ id: 1, caption: "根" }, { id: 2, caption: "子", parent: 1 }], edges: [] } as never);
  expect([graph.canRemove(1), graph.canRemove(2)]).toEqual([false, true]);
  expect(graph.hasSettings(2)).toBe(true);
});
