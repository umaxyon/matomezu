// ドラッグで箱を通す（docs/DRAG-plan.md）。つかんだ箱はポインタに追従し、進む向きの先にいた兄弟は、触れた瞬間に
// つかんだ箱の大きさ + 8px だけ開始位置の側へずれる（入れ替わる）。ドラッグ中は開始時の写しから毎回計算し直すので、
// 戻れば入れ替えも戻る。手を離したら確定する
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
test("タイトルを、途中の箱にぶつかっても止まらずにバックエンドの下まで動かせる。通り過ぎた箱は上へずれる", () => {
  const { el, graph } = setup(example("three-levels"));
  // 5px ずつ動かす（人の操作と同じく、途中を飛び越えない）
  dragBy(el, graph, 1, 0, 380, 76);
  expect(at(graph, 1)).toEqual([24, 396]);
  // タイトルの高さ 64 + 8 だけ上へ
  expect([at(graph, 2), at(graph, 3), at(graph, 10)]).toEqual([[40, 120 - 72], [220, 88 - 72], [220, 280 - 72]]);
  expect(at(graph, 17)).toEqual([364, 468]); // まだ触れていない
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

test("触れた瞬間に入れ替わり、そのまま通り過ぎても入れ替わったまま。戻れば元に戻る", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 40, 120, 300)] });
  const d = grab(el, graph, 1);
  d.move(0, 5); // 1 は y=45。まだ触れていない（間隔 8px の手前）
  expect(at(graph, 2)).toEqual([40, 120]);
  d.move(0, 10); // 1 は y=50。触れたので、2 は 1 の高さ + 8 だけ上へ
  expect(at(graph, 2)).toEqual([40, 120 - 72]);
  d.move(0, 160);
  expect(at(graph, 2)).toEqual([40, 48]);
  d.move(0, 0);
  expect(at(graph, 2)).toEqual([40, 120]);
  d.move(0, 160);
  d.up();
  expect([at(graph, 1), at(graph, 2)]).toEqual([[40, 200], [40, 48]]);
  expect(violations(el)).toEqual([]);
});

test("触れた直後に手を離すと、つかんだ箱が入れ替えた相手の向こう側へ寄って、入れ替えが完成する", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 40, 120, 300)] });
  dragBy(el, graph, 1, 0, 30, 6);
  expect([at(graph, 1), at(graph, 2)]).toEqual([[40, 48 + 64 + 8], [40, 48]]);
  expect(violations(el)).toEqual([]);
});

test("大きい箱を小さい 3 つの上へ: 3 つとも同じだけ開始位置の側へずれる", () => {
  const { el, graph } = setup({
    world: { width: 1000 },
    nodes: [box(1, 40, 40, 400), box(2, 40, 200), box(3, 180, 200), box(4, 320, 200)],
  });
  dragBy(el, graph, 1, 0, 150, 30); // 1 は y=190。3 つは 72 上の 128 へ。離すと 1 はその下へ寄る
  expect([at(graph, 2), at(graph, 3), at(graph, 4)]).toEqual([[40, 128], [180, 128], [320, 128]]);
  expect(at(graph, 1)).toEqual([40, 200]);
  expect(violations(el)).toEqual([]);
  // Undo 1 回で全員が戻る
  graph.undo();
  expect([at(graph, 1), at(graph, 2), at(graph, 3), at(graph, 4)]).toEqual([[40, 40], [40, 200], [180, 200], [320, 200]]);
});

test("横へ通すと、通り過ぎた箱はすべて同じだけ反対へずれる（並びを保つ）", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 320, 40), box(2, 40, 40), box(3, 176, 40)] });
  dragBy(el, graph, 1, -280, 0, 56); // 1 は x=40。2 と 3 は 1 の幅 120 + 8 だけ右へ
  expect([at(graph, 1), at(graph, 2), at(graph, 3)]).toEqual([[40, 40], [168, 40], [304, 40]]);
  expect(violations(el)).toEqual([]);
});

test("行って戻れば、全員が開始時の位置に戻る（ずらした結果を積み重ねない）", () => {
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

test("ずれた先がほかの箱とぶつかるなら入れ替えずに重ねて通し、手を離したら相手を下へずらす", () => {
  // 2 が上へずれると、1 の右隣の 3 にぶつかる
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 12, 12), box(3, 140, 12), box(2, 12, 100, 376)] });
  const d = grab(el, graph, 1);
  d.move(0, 60);
  expect(at(graph, 1)).toEqual([12, 72]);
  expect(at(graph, 2)).toEqual([12, 100]); // 重なったまま
  d.up();
  expect([at(graph, 1), at(graph, 2), at(graph, 3)]).toEqual([[12, 72], [12, 72 + 64 + 8], [140, 12]]);
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

test("手を離すと、入れ替わった先が本来いたい位置になる（あとでつかんだ箱が縮んでも戻らない）", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 300), box(2, 40, 150)] });
  dragBy(el, graph, 1, 0, -130, 26); // 1 は y=170。2 は 72 下の 222 へ。離すと 1 はその上へ寄る
  expect([at(graph, 1), at(graph, 2)]).toEqual([[40, 150], [40, 222]]);
  graph.update(1, { size: "S" }); // 1 が低くなる
  expect(at(graph, 2)).toEqual([40, 222]);
});
