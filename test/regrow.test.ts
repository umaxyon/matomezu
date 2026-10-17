// 大きさが変わったときの並べ直し（docs/PAPER-plan.md の 4.6。段階 3 はテーマの変更）: ページの起点から広がり、ぶつかる相手は同じ向きにだけ押す。
// 紙の端では内側へ押し込み、形を変えずに収まらなければ断る
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, type Graph, createGraph } from "../web/src/graph";
import { THEMES } from "../web/src/theme";
import { PAPERS } from "../web/src/validate";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => { graph?.destroy(); graph = null; document.body.innerHTML = ""; });

const events: { kind: string }[] = [];
function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  events.length = 0;
  graph = createGraph(el, data, { measureText: fakeMeasure, paper: true, onEvent: ev => events.push(ev) });
  return graph;
}
const info = (id: number) => graph!.info(id) as BoxInfo;
const A4 = PAPERS["a4-landscape"];
const PAD = DEFAULTS.padding;
const [, OX] = THEMES.find(t => t.id === "sticky")!.outset!.M!;

test("紙の右端にぴったりの箱も、付箋紙にすると左へ押し込まれて収まる（今までは断っていた。E6）", () => {
  const w = setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }).info(1).w;
  graph!.destroy();
  setup({ nodes: [{ id: 1, caption: "箱", x: A4.w - PAD - w, y: 40 }] });
  graph!.update(null, { theme: "sticky" });
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(0);
  expect(info(1).x + info(1).w).toBe(A4.w - PAD);
  expect(info(1).w).toBe(w + 2 * OX);
});

test("横に並んだ箱は横にだけ押す（右の箱は下へずれない。折り返さない）", () => {
  const w = setup({ nodes: [{ id: 1, caption: "左", x: 40, y: 40 }] }).info(1).w;
  graph!.destroy();
  setup({ nodes: [{ id: 1, caption: "左", x: 40, y: 40 }, { id: 2, caption: "右", x: 40 + w + DEFAULTS.gap, y: 40 }] });
  graph!.update(null, { theme: "sticky" });
  expect([info(1).x, info(1).y]).toEqual([40, 40]);
  expect(info(2).y).toBe(40);
  expect(info(2).x).toBe(40 + info(1).w + DEFAULTS.gap);
});

test("押し込んでも紙に収まらない（端から端まで詰まった列）なら断り、元のまま", () => {
  // 4 つの箱を、間隔の下限で紙の幅いっぱいに並べる（幅の指定で、土台の幅をそろえる）
  const width = Math.floor((A4.w - 2 * PAD - 3 * DEFAULTS.gap) / 4);
  const w = setup({ nodes: [{ id: 1, caption: "箱", width, x: 40, y: 40 }] }).info(1).w;
  graph!.destroy();
  expect(A4.w - 2 * PAD - (4 * w + 3 * DEFAULTS.gap)).toBeLessThan(4 * 2 * OX); // 補正値の分だけ広がると入らない
  setup({ nodes: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, caption: "箱", width, x: PAD + i * (w + DEFAULTS.gap), y: 40 })) });
  const before = graph!.toJSON();
  graph!.update(null, { theme: "sticky" });
  expect(graph!.toJSON()).toEqual(before);
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(1);
});

test("グループの中に左の余裕があれば、中で詰めて収め、グループは横に広がらない", () => {
  const w = setup({ nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }] }).info(1).w;
  graph!.destroy();
  // 左の子を右へ寄せて置く（グループの幅は右の子の位置で決まり、左に 40px の余裕がある）
  setup({
    nodes: [
      { id: 1, caption: "グループ", x: 40, y: 40 },
      { id: 2, caption: "子", parent: 1, x: PAD + 40, y: 40 },
      { id: 3, caption: "子", parent: 1, x: PAD + 40 + w + DEFAULTS.gap, y: 40 },
    ],
  });
  const gw = info(1).w;
  graph!.update(null, { theme: "sticky" });
  expect(info(1).w).toBe(gw);
  expect(info(3).y).toBe(info(2).y);
  expect(info(3).x - (info(2).x + info(2).w)).toBe(DEFAULTS.gap);
});

test("ツリーのページは横の真ん中と上を保って広がる（ページの起点。STRATEGIES の growFrom）", () => {
  setup({
    world: { childView: "tree", root: 1 },
    nodes: [{ id: 1, caption: "根", x: 300, y: 40 }, { id: 2, caption: "子", parent: 1 }, { id: 3, caption: "子", parent: 1 }],
  });
  const b = info(1);
  graph!.update(null, { theme: "sticky" });
  const a = info(1);
  expect(a.w).toBeGreaterThan(b.w);
  expect(a.x + a.w / 2).toBe(b.x + b.w / 2);
  expect(a.y).toBe(b.y);
});

test("付箋紙から戻すと、広がった箱は元の大きさに戻り、起点（左上）は動かない", () => {
  setup({ nodes: [{ id: 1, caption: "箱", x: 100, y: 100 }] });
  const b = info(1);
  graph!.update(null, { theme: "sticky" });
  graph!.update(null, { theme: null });
  expect([info(1).x, info(1).y, info(1).w, info(1).h]).toEqual([b.x, b.y, b.w, b.h]);
});

test("断った設定変更の原因は、1 つずつ当てて確かめた項目（大きさに関わらない色は入らない）。確かめたあとも断ったあとの状態のまま", () => {
  const width = Math.floor((A4.w - 2 * PAD - 3 * DEFAULTS.gap) / 4);
  const w = setup({ nodes: [{ id: 1, caption: "箱", width, x: 40, y: 40 }] }).info(1).w;
  graph!.destroy();
  setup({ nodes: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, caption: "箱", width, x: PAD + i * (w + DEFAULTS.gap), y: 40 })) });
  const slack = A4.w - 2 * PAD - (4 * w + 3 * DEFAULTS.gap);
  expect(slack).toBeLessThan(2 * OX); // 1 つの箱が付箋紙になるだけで入らない
  const before = graph!.toJSON();
  graph!.select(2);
  expect(graph!.batch(() => graph!.update(2, { theme: "sticky", color: "danger" }))).toBe(false);
  expect(graph!.refusedBy()).toEqual(["theme"]);
  expect(graph!.toJSON()).toEqual(before);
  expect(graph!.selected()).toBe("2");
  // 収まる変更のあとは空
  expect(graph!.batch(() => graph!.update(2, { color: "danger" }))).toBe(true);
  expect(graph!.refusedBy()).toEqual([]);
});

// ---- 段階 5: 作り直しの入口（追加・付け替え・貼り付け）、箱を消す、つまみ ----

test("箱の中へ付け替えて育った箱は、データの並びで後ろにあっても跳ばずに、下の兄弟を押し下げる（F26）", () => {
  setup({
    nodes: [
      { id: 1, caption: "外", x: 40, y: 40 },
      // B（下）がデータで先、A（上）が後ろ
      { id: 3, caption: "B", parent: 1, x: 12, y: 144 },
      { id: 2, caption: "A", parent: 1, x: 12, y: 30 },
      { id: 4, caption: "A の子", parent: 2, x: 12, y: 30 },
      { id: 9, caption: "入れる箱", x: 600, y: 40 },
    ],
  });
  const a = info(2), b = info(3);
  graph!.reparent(9, 2);
  expect([info(2).x, info(2).y]).toEqual([a.x, a.y]); // A は動かない
  expect(info(2).h).toBeGreaterThan(a.h);
  expect(info(3).x).toBe(b.x); // B は真下へ押される
  expect(info(3).y).toBe(info(2).y + info(2).h + DEFAULTS.gap);
});

test("グループに箱を足して横に広がると、右隣を右へ押し（下へはずらさない）、足した箱を消すと右隣は元の位置へ戻る", () => {
  setup({
    nodes: [
      { id: 1, caption: "グループ", x: 40, y: 40 },
      { id: 2, caption: "子", parent: 1, x: 12, y: 30 },
      { id: 3, caption: "右隣", x: 40 + 144 + DEFAULTS.gap, y: 40 },
    ],
  });
  const right = info(3);
  expect(info(1).x + info(1).w + DEFAULTS.gap).toBe(right.x); // 隙間は下限ちょうど
  const id = graph!.add({ parentId: "1", at: { x: 140, y: 30 } }, { caption: "足した" });
  expect(id).not.toBe("");
  expect(info(3).y).toBe(right.y);
  expect(info(3).x).toBe(info(1).x + info(1).w + DEFAULTS.gap);
  graph!.remove(id);
  expect([info(3).x, info(3).y]).toEqual([right.x, right.y]);
});

test("グループの中で育った子が左の余裕へ詰めたら、元の大きさに戻すと元の位置へ戻る（詰めた間隔も戻る。4.6 の 8）", () => {
  setup({
    nodes: [
      { id: 1, caption: "グループ", x: 40, y: 40 },
      { id: 2, caption: "子", parent: 1, x: 52, y: 30 },
      { id: 3, caption: "子", parent: 1, x: 52 + 120 + DEFAULTS.gap, y: 30 },
    ],
  });
  const [b2, b3, g] = [info(2), info(3), info(1)];
  graph!.update(3, { theme: "sticky" });
  expect(info(1).w).toBe(g.w); // グループは広がらない（左の余裕を使う）
  expect(info(2).x).toBeLessThan(b2.x);
  graph!.update(3, { theme: null });
  expect([info(2).x, info(3).x, info(1).w]).toEqual([b2.x, b3.x, g.w]);
});

test("本文の幅のつまみは、紙に収まる幅で止まる（列に余裕が無ければ、それ以上は広げない）", () => {
  // 本文の箱（160）と右の箱で、紙の幅いっぱい
  setup({ nodes: [{ id: 1, caption: "本文の箱", body: "本文", x: PAD, y: 40 }, { id: 2, caption: "右の箱", width: A4.w - 2 * PAD - 160 - DEFAULTS.gap, x: PAD + 160 + DEFAULTS.gap, y: 40 }] });
  const at2 = [info(2).x, info(2).w];
  graph!.select(1);
  const grip = document.querySelector<HTMLElement>('.mz-node[data-id="1"] > .mz-head > .mz-body-grip')!;
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", 60);
  expect(info(1).w).toBe(160);
  expect([info(2).x, info(2).w]).toEqual(at2);
  fire("pointerup", 60);
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(0);
});

test("本文の幅のつまみで広げたとき、左に余裕があれば、箱ごと左の余裕へ寄って収まる（4.6 の 4。手触りは画面で確かめる）", () => {
  const right = A4.w - PAD - 120;
  setup({ nodes: [{ id: 1, caption: "本文の箱", body: "本文", x: right - 8 - 160, y: 40 }, { id: 2, caption: "右の箱", width: 120, x: right, y: 40 }] });
  graph!.select(1);
  const grip = document.querySelector<HTMLElement>('.mz-node[data-id="1"] > .mz-head > .mz-body-grip')!;
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", 60);
  expect(info(1).w).toBe(220);
  expect(info(1).x + info(1).w).toBe(right - 8);
  expect(info(2).x).toBe(right);
  fire("pointermove", 0);
  expect([info(1).x, info(1).w]).toEqual([right - 8 - 160, 160]); // 戻せば元の位置
  fire("pointerup", 0);
});

// ---- 段階 5c: グループの子として入れる置き方（4.7）と、追加の置き方（4.6） ----

const groupOf2 = (k2x: number): Diagram => ({
  nodes: [
    { id: 1, caption: "グループ", x: 40, y: 40 },
    { id: 2, caption: "子", parent: 1, x: k2x, y: 30 },
    { id: 3, caption: "子", parent: 1, x: k2x + 128, y: 30 },
    { id: 9, caption: "入れる", x: 40, y: 400 },
  ],
});

test("グループの左上が空いていれば、そこに入れるだけで、中の子は動かさない", () => {
  setup({ nodes: [{ id: 1, caption: "グループ", x: 40, y: 40 }, { id: 3, caption: "子", parent: 1, x: 140, y: 102 }, { id: 9, caption: "入れる", x: 40, y: 400 }] });
  const k = info(3);
  graph!.reparent(9, 1);
  expect([graph!.toJSON().nodes.find(n => n.id === 9)!.x, graph!.toJSON().nodes.find(n => n.id === 9)!.y]).toEqual([12, 30]);
  expect([info(3).x, info(3).y]).toEqual([k.x, k.y]);
});

test.each([
  ["付け替え", () => graph!.reparent(9, 1)],
  ["貼り付け（グループを選んで）", () => { graph!.select(9); graph!.copySelected(); graph!.select(1); graph!.pasteClip(); }],
  ["一覧から戻す（落とした位置は使わない）", () => { graph!.remove(9); graph!.restore(9, 1, { x: 200, y: 60 }); }],
] as const)("左上がふさがっていれば、中の子全体を並びを保って下へずらし、左上に入れる: %s", (_, run) => {
  setup(groupOf2(12));
  const [k2, k3] = [info(2), info(3)];
  run();
  const put = graph!.toJSON().nodes.find(n => n.parent === 1 && n.id !== 2 && n.id !== 3)!;
  expect([put.x, put.y]).toEqual([12, 30]);
  const d = 64 + DEFAULTS.gap; // 新しい箱の高さと間隔の下限
  expect([info(2).x, info(2).y, info(3).x, info(3).y]).toEqual([k2.x, k2.y + d, k3.x, k3.y + d]); // 当たらない右の子も一緒に
});

test("入れた箱を消しても、ずらした子は戻らない（上に空きが残る。Undo なら戻る）", () => {
  setup(groupOf2(12));
  const y2 = info(2).y;
  graph!.reparent(9, 1);
  const shifted = info(2).y;
  expect(shifted).toBeGreaterThan(y2);
  graph!.remove(9);
  expect(info(2).y).toBe(shifted);
  graph!.undo();
  graph!.undo();
  expect(info(2).y).toBe(y2);
});

test("追加で押した所に今ある箱があれば、足した箱の方が近くの空きへずれ、今ある箱は動かさない", () => {
  setup(groupOf2(12));
  const [k2, k3] = [info(2), info(3)];
  const id = graph!.add({ parentId: "1", at: { x: 20, y: 40 } }, { caption: "足した" });
  expect([info(2).x, info(2).y, info(3).x, info(3).y]).toEqual([k2.x, k2.y, k3.x, k3.y]);
  const a = graph!.info(id);
  for (const k of [info(2), info(3)]) expect(a.x + a.w <= k.x || k.x + k.w <= a.x || a.y + a.h <= k.y || k.y + k.h <= a.y).toBe(true);
});

test("追加で押した所がふさがっていて、グループの中に空きが無ければ、右か下の広がりの小さい方に置き、グループを片方の向きにだけ広げる", () => {
  setup({ nodes: [{ id: 1, caption: "グループ", x: 40, y: 40 }, { id: 2, caption: "子", parent: 1, x: 12, y: 30 }] });
  const g = info(1), k = info(2);
  const id = graph!.add({ parentId: "1", at: { x: 20, y: 40 } }, { caption: "足した" });
  const a = graph!.info(id);
  expect([info(2).x, info(2).y]).toEqual([k.x, k.y]);
  expect([a.x, a.y]).toEqual([k.x, k.y + k.h + DEFAULTS.gap]); // 下（右より広がりが小さい）
  expect(info(1).w).toBe(g.w); // 横には広がらない
  expect(info(1).h).toBe(g.h + 64 + DEFAULTS.gap);
});

test("追加で押した所がふさがっていても、グループの中に空きがあれば、そこへ置いてグループは広げない", () => {
  setup({ nodes: [{ id: 1, caption: "グループ", x: 40, y: 40 }, { id: 2, caption: "子", parent: 1, x: 12, y: 30 }, { id: 3, caption: "子", parent: 1, x: 140, y: 102 }] });
  const g = info(1);
  const id = graph!.add({ parentId: "1", at: { x: 20, y: 40 } }, { caption: "足した" });
  expect([info(1).w, info(1).h]).toEqual([g.w, g.h]);
  const a = graph!.info(id);
  for (const k of [info(2), info(3)]) expect(a.x + a.w <= k.x || k.x + k.w <= a.x || a.y + a.h <= k.y || k.y + k.h <= a.y).toBe(true);
});

test("追加で、右にも下にも紙に収まらなければ足さない", () => {
  // 紙の右下いっぱいのグループ（子 1 つ）。右も下も紙の端
  const w = A4.w - 2 * PAD, h = A4.h - 2 * PAD;
  setup({ nodes: [{ id: 1, caption: "グループ", x: PAD, y: PAD }, { id: 2, caption: "子", parent: 1, width: w - 24, height: h - 42, x: 12, y: 30 }] });
  const before = graph!.toJSON();
  expect(graph!.add({ parentId: "1", at: { x: 20, y: 40 } }, { caption: "足した" })).toBe("");
  expect(graph!.toJSON()).toEqual(before);
  expect(events.filter(e => e.kind === "overPaper")).toHaveLength(1);
});

test("追加でずらした先は並びにそろう（下に置くなら今ある子か中の左端にそろえ、押した横の位置のままにしない）", () => {
  setup({ nodes: [{ id: 1, caption: "グループ", x: 40, y: 40 }, { id: 2, caption: "子", parent: 1, x: 12, y: 30 }, { id: 3, caption: "子", parent: 1, x: 140, y: 30 }] });
  const id = graph!.add({ parentId: "1", at: { x: 30, y: 40 } }, { caption: "足した" });
  const a = graph!.toJSON().nodes.find(n => String(n.id) === id)!;
  expect([a.x, a.y]).toEqual([12, 30 + 64 + DEFAULTS.gap]);
});
