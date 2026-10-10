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

test("相手の大きさの半分まで食い込んだら入れ替わり、そのまま通り過ぎても入れ替わったまま。戻れば元に戻る", () => {
  // 2 は高さ 64 なので、1 の下端が 2 の上端 120 から 32 食い込んだ（1 の y が 88 を超えた）ら入れ替わる
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 40, 120, 300)] });
  const d = grab(el, graph, 1);
  d.move(0, 10); // 1 は y=50。間隔の内側に入ったが、まだ食い込んでいない
  expect(at(graph, 2)).toEqual([40, 120]);
  d.move(0, 45); // 1 は y=85。食い込みは 29 で、半分に届かない（重なって通る）
  expect(at(graph, 2)).toEqual([40, 120]);
  d.move(0, 50); // 1 は y=90。食い込みが 34 になったので、2 は 1 の高さ + 8 だけ上へ
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

test("入れ替わった直後に手を離すと、つかんだ箱が入れ替えた相手の向こう側へ寄って、入れ替えが完成する", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 40, 120, 300)] });
  dragBy(el, graph, 1, 0, 50, 10);
  expect([at(graph, 1), at(graph, 2)]).toEqual([[40, 48 + 64 + 8], [40, 48]]);
  expect(violations(el)).toEqual([]);
});

test("半分まで食い込む前に手を離すと、つかんだ箱が相手の手前へ戻る。相手は動かない", () => {
  const { el, graph } = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 40, 120, 300)] });
  dragBy(el, graph, 1, 0, 25, 5); // 1 は y=65。2 と 9 重なる
  expect([at(graph, 1), at(graph, 2)]).toEqual([[40, 120 - 8 - 64], [40, 120]]);
  expect(violations(el)).toEqual([]);
  // 横からでも同じ
  const g2 = setup({ world: { width: 1000 }, nodes: [box(1, 40, 40), box(2, 200, 40)] });
  dragBy(g2.el, g2.graph, 1, 40, 0, 8); // 1 の右端は 200。2 の左端 200 にちょうど接する（食い込みは 60 まで要る）
  expect([at(g2.graph, 1), at(g2.graph, 2)]).toEqual([[200 - 8 - 120, 40], [200, 40]]);
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

// 2026-10-03: 斜めにかすめるだけでは入れ替えない（横切る軸で、小さい方の幅か高さの半分以上重なったときだけ）
test("箱の角を斜めにかすめて通っても、相手は入れ替わらない", () => {
  // 1 は 40〜160 × 40〜104。2 は 120〜240 × 112〜176（1 の右下、縦の隙間 8）
  const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 120, y: 112 }] });
  // 1 を右へ 300、下へ 4 動かす。縦の隙間は 4 になるが重なってはいない（以前は隙間 8 以内で入れ替えていた）
  dragBy(el, graph, 1, 300, 4, 60);
  expect(at(graph, 2)).toEqual([120, 112]);
  // 1 を少し下げて、縦に 20（2 の高さの 1/3）だけ重ねて右へ通しても、半分に届かないので入れ替えない
  const { el: el2, graph: g2 } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 200, y: 84 }] });
  dragBy(el2, g2, 1, 300, 0, 60);
  expect(at(g2, 2)).toEqual([200, 84]);
});

test("正面から（横切る軸で半分以上重なって）触れれば、今までどおり入れ替わる", () => {
  // 2 は 200〜320 × 60〜124。1 と縦に 44 重なる（高さ 64 の半分以上）
  const { el, graph } = setup({ nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 200, y: 60 }] });
  dragBy(el, graph, 1, 300, 0, 60);
  expect(at(graph, 2)).toEqual([200 - 128, 60]); // 1 の幅 120 + 8 だけ左へ
});

// 2026-10-03: 入れ替えは通り道で決める。上を回り込んで反対側へ出ても、通り抜けたことにはしない
test("兄弟の上を回り込んで反対側へ出て、さらに離れても、兄弟は入れ替わらない", () => {
  // 1（利用者）は 2（画面）の右。2 は 200〜320 × 200〜264、1 は 400〜520 × 200〜264
  const { el, graph } = setup({ nodes: [{ id: 1, x: 400, y: 200 }, { id: 2, x: 200, y: 200 }] });
  const g = grab(el, graph, 1);
  g.move(0, -120);    // 上へ（2 の上の段へ）
  g.move(-320, -120); // 2 の上を越えて左へ
  g.move(-320, 0);    // 2 の左に下りる
  expect(at(graph, 2)).toEqual([200, 200]);
  g.move(-400, 0);    // さらに左へ
  expect(at(graph, 2)).toEqual([200, 200]);
  g.up();
  expect(at(graph, 2)).toEqual([200, 200]);
});

test("兄弟を正面から通り抜ければ、今までどおり入れ替わる（通り道で来たことを覚えている）", () => {
  const { el, graph } = setup({ nodes: [{ id: 1, x: 400, y: 200 }, { id: 2, x: 200, y: 200 }] });
  const g = grab(el, graph, 1);
  g.move(-320, 0); // 2 を左へ通り抜ける
  expect(at(graph, 2)).toEqual([200 + 128, 200]); // 1 の幅 120 + 8 だけ右（開始位置の側）へ
  g.up();
});

// 2026-10-03: 進む向きは今の動きで決める。縦に大きく動いてから横からぶつけても、横に入れ替わる
test("縦に動いてから横からぶつけると、左右に入れ替わる（上下に押しのけない）", () => {
  // 2（画面）は 200〜320 × 200〜264。1（利用者）は右上の 400〜520 × 0〜64
  const { el, graph } = setup({ nodes: [{ id: 1, x: 400, y: 0 }, { id: 2, x: 200, y: 200 }] });
  const g = grab(el, graph, 1);
  g.move(0, 200);    // 2 の右の同じ段へ下りる（まだ触れていない）
  expect(at(graph, 2)).toEqual([200, 200]);
  g.move(-160, 200); // 左へ進んで 2 に横からぶつける
  expect(at(graph, 2)).toEqual([200 + 128, 200]); // 1 の幅 120 + 8 だけ右（来た側）へ。上下には動かない
  g.up();
});
