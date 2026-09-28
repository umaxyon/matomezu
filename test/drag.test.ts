// ドラッグで箱を通す（docs/DRAG-plan.md）。つかんだ箱はポインタに追従し、通り道の兄弟は開始位置の側へどく。
// ドラッグ中は開始時の写しから毎回計算し直すので、離れればどいた箱は戻る。手を離したら確定する
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram } from "../web/src/types";
import { dragBy, example, fakeMeasure, violations } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure });
  graphs.push(graph);
  return { el, graph };
}

const at = (g: Graph, id: number) => [g.info(id).x, g.info(id).y];

// three-levels.json の id: 1 タイトル、2 ユーザー、3 フロントエンド、10 バックエンド、17 外部サービス
test("タイトルを、途中の箱にぶつかっても止まらずにバックエンドの下まで動かせる", () => {
  const { el, graph } = setup(example("three-levels"));
  const before = { 2: at(graph, 2), 3: at(graph, 3), 10: at(graph, 10) };
  // 5px ずつ動かす（人の操作と同じく、途中を飛び越えない）
  dragBy(el, graph, 1, 0, 420, 84);
  expect(at(graph, 1)).toEqual([24, 436]);
  // 通り過ぎた箱は元の位置のまま
  expect(at(graph, 2)).toEqual(before[2]);
  expect(at(graph, 3)).toEqual(before[3]);
  expect(at(graph, 10)).toEqual(before[10]);
  expect(violations(el)).toEqual([]);
});

// id のボックスをつかむ。move で (dx, dy) まで 5px ずつ動かし（離さない）、up で離す
function grab(el: HTMLElement, graph: Graph, id: number) {
  graph.select(id);
  const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
  const fire = (type: string, x: number, y: number) =>
    head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  let cx = 0, cy = 0;
  fire("pointerdown", 0, 0);
  return {
    move(dx: number, dy: number) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx - cx, dy - cy) / 5));
      const [sx, sy] = [cx, cy];
      for (let i = 1; i <= steps; i++) fire("pointermove", sx + ((dx - sx) * i) / steps, sy + ((dy - sy) * i) / steps);
      [cx, cy] = [dx, dy];
    },
    up() { fire("pointerup", cx, cy); },
  };
}

// 文字の箱（fakeMeasure で 120×64。width を書けばその幅）
const box = (id: number, x: number, y: number, width?: number) => ({ id, caption: `b${id}`, x, y, ...(width ? { width } : {}) });

test("小さい箱を大きい箱の上から下へ通す: 相手は下へ、上に収まれば上へ、通り過ぎれば元の位置へ", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 40, 120, 300)] });
  const d = grab(el, graph, 1);
  d.move(0, 30); // 1 は y=70。上へはどけない（ワールドの上端）ので下へ
  expect(at(graph, 2)).toEqual([40, 70 + 64 + 8]);
  d.move(0, 60); // 1 は y=100。上に収まる
  expect(at(graph, 2)).toEqual([40, 100 - 8 - 64]);
  d.move(0, 160); // 1 は y=200。もう重ならない
  expect(at(graph, 2)).toEqual([40, 120]);
  d.up();
  expect(at(graph, 1)).toEqual([40, 200]);
  expect(violations(el)).toEqual([]);
});

test("大きい箱を小さい 3 つの上へ: 3 つとも開始位置の側へそろってどく", () => {
  const { el, graph } = setup({
    world: { width: 1000 },
    nodes: [box(1, 40, 40, 400), box(2, 40, 200), box(3, 180, 200), box(4, 320, 200)],
  });
  dragBy(el, graph, 1, 0, 150, 30); // 1 は y=190
  expect([at(graph, 2), at(graph, 3), at(graph, 4)]).toEqual([[40, 118], [180, 118], [320, 118]]);
  expect(violations(el)).toEqual([]);
  // Undo 1 回で全員が戻る
  graph.undo();
  expect([at(graph, 1), at(graph, 2), at(graph, 3), at(graph, 4)]).toEqual([[40, 40], [40, 200], [180, 200], [320, 200]]);
});

test("どいた先でぶつかる相手も、同じ向きに続けてどく", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 320, 40), box(2, 40, 40), box(3, 176, 40)] });
  dragBy(el, graph, 1, -280, 0, 56); // 1 は x=40。開始位置の側（右）へ
  expect([at(graph, 1), at(graph, 2), at(graph, 3)]).toEqual([[40, 40], [168, 40], [296, 40]]);
  expect(violations(el)).toEqual([]);
});

test("行って戻れば、全員が開始時の位置に戻る（押した結果を積み重ねない）", () => {
  const { el, graph } = setup({
    world: { width: 1000 },
    nodes: [box(1, 40, 40, 400), box(2, 40, 200), box(3, 180, 200), box(4, 180, 272)],
  });
  const start = [1, 2, 3, 4].map(id => at(graph, id));
  const d = grab(el, graph, 1);
  d.move(0, 300);
  d.move(60, 120);
  d.move(0, 0);
  expect([1, 2, 3, 4].map(id => at(graph, id))).toEqual(start);
  d.up();
});

test("どちらへもどけられなければ重なったまま通し、手を離したら相手をずらす", () => {
  // ワールドの高さが決まっていて、2 は上にも下にも逃げられない
  const { el, graph } = setup({ world: { width: 800, height: 200 }, nodes: [box(1, 12, 12), box(2, 12, 100, 376)] });
  const d = grab(el, graph, 1);
  d.move(0, 60);
  expect(at(graph, 1)).toEqual([12, 72]);
  expect(at(graph, 2)).toEqual([12, 100]); // 重なったまま
  d.up();
  expect(at(graph, 1)).toEqual([12, 72]);
  expect(violations(el)).toEqual([]);
});

test("中身を動かして広がった祖先は、下にいた相手を押す", () => {
  const { el, graph } = setup({
    world: { width: 1000 },
    nodes: [box(1, 40, 40), { id: 2, caption: "k", parent: 1 }, box(3, 40, 200)],
  });
  dragBy(el, graph, 2, 0, 150, 30);
  const g = graph.info(1);
  expect(at(graph, 3)).toEqual([40, g.y + g.h + 8]);
  expect(violations(el)).toEqual([]);
});

test("手を離すと、どいた先が本来いたい位置になる（あとで押していた箱が縮んでも戻らない）", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 300), box(2, 40, 150)] });
  dragBy(el, graph, 1, 0, -130, 26); // 1 は y=170。2 は開始位置の側（下）へ
  expect(at(graph, 2)).toEqual([40, 170 + 64 + 8]);
  graph.update(1, { size: "S" }); // 1 が低くなる
  expect(at(graph, 2)).toEqual([40, 242]);
});
