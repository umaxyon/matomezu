// 箱どうしの最小間隔の入口（layout.ts の gapBetween）と、親の中に収める決まり（clamp）の組み合わせと境目。
// 組ごとの間隔の基本（8/32/40 と押しのけ）は test/outset.test.ts、置き場所で変えてついてくることは test/params.test.ts。
// ここでは、全世界の 3 つの間隔をわざと別々の値にして（取り違えれば失敗する）、線の数・向き・キャプションの中身・階層・戦略を組み合わせる
import { afterEach, expect, test } from "bun:test";
import { DEFAULTS, createGraph, type Graph, type GraphOptions } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});
// 3 つの間隔を互いに違う値にする（どれを使ったかが結果から分かる）
const GAPS = { gap: 5, linkGap: 21, captionGap: 47 };
const setup = (data: Diagram, o: GraphOptions = GAPS) => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure, ...o });
  graphs.push(graph);
  return graph;
};
const info = (g: Graph, id: number) => g.info(id) as BoxInfo;
const gapY = (g: Graph, up: number, down: number) => info(g, down).y - (info(g, up).y + info(g, up).h);
// 上の箱に重ねて置いた下の箱が、押しのけられた間隔
const pushed = (edges: Diagram["edges"]) => {
  const g = setup({ nodes: [{ id: 1, caption: "上", x: 100, y: 100 }, { id: 2, caption: "下", x: 100, y: 110 }, { id: 3, caption: "別", x: 400, y: 100 }], edges });
  return gapY(g, 1, 2);
};

test("線の向きによらない: 上から下へ引いても、下から上へ引いても linkGap", () => {
  expect(pushed([{ id: "e1", from: 1, to: 2 }])).toBe(GAPS.linkGap);
  expect(pushed([{ id: "e1", from: 2, to: 1 }])).toBe(GAPS.linkGap);
});

test("キャプションが空白だけの線は、キャプションの無い線と同じ（linkGap）", () => {
  expect(pushed([{ id: "e1", from: 1, to: 2, caption: "  " }])).toBe(GAPS.linkGap);
  expect(pushed([{ id: "e1", from: 1, to: 2, caption: "" }])).toBe(GAPS.linkGap);
});

test("同じ組に線が 2 本あれば、広い方（キャプションのある線の captionGap）。並び順によらない", () => {
  expect(pushed([{ id: "e1", from: 1, to: 2, caption: "はい" }, { id: "e2", from: 2, to: 1 }])).toBe(GAPS.captionGap);
  expect(pushed([{ id: "e1", from: 2, to: 1 }, { id: "e2", from: 1, to: 2, caption: "はい" }])).toBe(GAPS.captionGap);
});

test("ほかの箱へ引いた線や、自分に戻る線は、この組の間隔を広げない（gap のまま）", () => {
  expect(pushed([{ id: "e1", from: 1, to: 3, caption: "はい" }, { id: "e2", from: 2, to: 3 }, { id: "e3", from: 1, to: 1 }])).toBe(GAPS.gap);
});

test("境目: ちょうど linkGap 離れていれば動かさず、1px でも近ければ linkGap まで離す", () => {
  const h = info(setup({ nodes: [{ id: 1, caption: "上", x: 100, y: 100 }] }), 1).h;
  const at = (dy: number) => {
    const g = setup({ nodes: [{ id: 1, caption: "上", x: 100, y: 100 }, { id: 2, caption: "下", x: 100, y: 100 + h + dy }], edges: [{ id: "e1", from: 1, to: 2 }] });
    return info(g, 2).y - 100 - h;
  };
  expect(at(GAPS.linkGap)).toBe(GAPS.linkGap);
  expect(at(GAPS.linkGap + 3)).toBe(GAPS.linkGap + 3); // 離れているものは寄せない
  expect(at(GAPS.linkGap - 1)).toBe(GAPS.linkGap);
});

test("横に離れていても、間隔より近ければぶつかる（つながった組は linkGap の内側に入れない）", () => {
  // 左右に並べ、横のすき間を gap より広く linkGap より狭くする。線が無ければそのまま、線があれば同じ向き（右）へ押しのける
  // （開いたときも regrow と同じ決まり。D45。前は下へずらしていた）
  const w = info(setup({ nodes: [{ id: 1, caption: "左", x: 100, y: 100 }] }), 1).w;
  const data = (edges: Diagram["edges"]): Diagram => ({
    nodes: [{ id: 1, caption: "左", x: 100, y: 100 }, { id: 2, caption: "右", x: 100 + w + GAPS.gap + 4, y: 100 }], edges,
  });
  const free = setup(data([]));
  expect(info(free, 2).y).toBe(100);
  const linked = setup(data([{ id: "e1", from: 1, to: 2 }]));
  expect(info(linked, 2).x - (info(linked, 1).x + info(linked, 1).w)).toBe(GAPS.linkGap);
  expect(info(linked, 2).y).toBe(100);
});

test("グループの中の兄弟どうしも組ごとの間隔。3 つ目の兄弟との線は、その組の間隔に効かない", () => {
  const g = setup({
    nodes: [
      { id: 1, caption: "グループ", x: 40, y: 40 },
      { id: 2, caption: "上", parent: 1, x: 12, y: 30 }, { id: 3, caption: "下", parent: 1, x: 12, y: 40 },
      { id: 4, caption: "中", parent: 1, x: 200, y: 30 }, { id: 5, caption: "中", parent: 1, x: 200, y: 40 },
      { id: 9, caption: "別", parent: 1, x: 400, y: 30 },
    ],
    edges: [{ id: "e1", from: 2, to: 3, caption: "はい" }, { id: "e2", from: 4, to: 9 }, { id: "e3", from: 5, to: 9 }],
  });
  expect(gapY(g, 2, 3)).toBe(GAPS.captionGap);
  expect(gapY(g, 4, 5)).toBe(GAPS.gap);
});

test("リストの子は、線でつながっていても戦略の kidGap で並ぶ（全世界の組ごとの間隔を使わない）", () => {
  const g = setup({
    nodes: [{ id: 1, caption: "リスト", childView: "list", x: 40, y: 40 }, { id: 2, caption: "a", parent: 1 }, { id: 3, caption: "b", parent: 1 }],
    edges: [{ id: "e1", from: 2, to: 3, caption: "はい" }],
  });
  expect(gapY(g, 2, 3)).toBe(STRATEGIES.list.kidGap!);
});

test("フローチャートの中は、線もキャプションもあっても全世界の gap（戦略が組ごとの間隔を使わない）", () => {
  expect(STRATEGIES.flow.pairGaps).toBe(false);
  const g = setup({
    world: { childView: "flow" },
    nodes: [{ id: 2, caption: "上", x: 20, y: 40 }, { id: 3, caption: "下", x: 20, y: 50 }],
    edges: [{ id: "e1", from: 2, to: 3, caption: "はい" }, { id: "e2", from: 3, to: 2 }],
  });
  expect(gapY(g, 2, 3)).toBe(GAPS.gap);
});

// ---- 親の中に収める（clamp） ----

test("最上位の箱を負の位置に書くと、ワールドの余白（padding）の内側へ寄せる", () => {
  const g = setup({ nodes: [{ id: 1, caption: "箱", x: -50, y: -30 }] });
  expect([info(g, 1).x, info(g, 1).y]).toEqual([DEFAULTS.padding, DEFAULTS.padding]);
});

test("グループの子を左上の外に書くと、左は padding、上は見出しの下（header）へ寄せる", () => {
  const g = setup({ nodes: [{ id: 1, caption: "グループ", x: 40, y: 40 }, { id: 2, caption: "子", parent: 1, x: -10, y: 0 }] });
  expect([info(g, 2).x, info(g, 2).y]).toEqual([DEFAULTS.padding, DEFAULTS.header]);
});
