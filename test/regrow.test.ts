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
