// フローチャートの戦略（docs/PATTERN-plan.md の 3.7 章）: 子を自由に置き、子はフローチャートの形を使え、子は子を持てない
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxInfo, Diagram, EdgeInfo } from "../web/src/types";
import { STRATEGIES, splitBranches } from "../web/src/model";
import { VIEWS, WORLD_VIEWS, problems } from "../web/src/validate";
import { fakeMeasure } from "./helpers";
import { alignFlow } from "../web/src/layout/flow-align";
import { fewestRoute, route } from "../web/src/routing";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const events: string[] = [];
  const graph = createGraph(el, data, { measureText: fakeMeasure, onEvent: ev => events.push(ev.kind) });
  graphs.push(graph);
  return { el, graph, events };
}

// 1 がフローチャート。2〜4 がその子（六角形・ひし形・円）。10 は外の六角形、11 は外の円、12 は子を持つ外の箱
const data = (): Diagram => ({
  nodes: [
    { id: 1, caption: "流れ", childView: "flow", x: 40, y: 40 },
    { id: 2, caption: "準備", parent: 1, shape: "hexagon", x: 20, y: 40 },
    { id: 3, caption: "分岐", parent: 1, shape: "diamond", x: 20, y: 160 },
    { id: 4, caption: "接続", parent: 1, shape: "circle", x: 220, y: 160 },
    { id: 10, caption: "外の六角形", shape: "hexagon", x: 600, y: 40 },
    { id: 11, caption: "外の円", shape: "circle", x: 600, y: 200 },
    { id: 12, caption: "親", x: 600, y: 360 },
    { id: 13, caption: "子", parent: 12 },
  ],
  edges: [{ id: "e1", from: 3, to: 4 }, { id: "e2", from: 2, to: 3 }],
});
const info = (g: Graph, id: number) => g.info(id) as BoxInfo;

test("フローチャートの形は、フローチャートの子のときだけ使い、外ではボックスで見せる（データは残す）。円はどこでも使える", () => {
  const { graph } = setup(data());
  expect([2, 3, 4, 10, 11].map(id => info(graph, id).shape)).toEqual(["hexagon", "diamond", "circle", "box", "circle"]);
  expect(info(graph, 2).shapes).toContain("trapezoid");
  expect(info(graph, 10).shapes).not.toContain("hexagon");
  expect(info(graph, 10).shapes).toContain("circle");
  // 外へ出すとボックスで見せ、データの形は残る。戻せば形も戻る
  graph.reparent(2, null, { x: 600, y: 600 });
  expect(info(graph, 2).shape).toBe("box");
  expect(graph.toJSON().nodes.find(n => n.id === 2)!.shape).toBe("hexagon");
  graph.reparent(2, 1);
  expect(info(graph, 2).shape).toBe("hexagon");
});

test("フローチャートの子は子を持てない: 子の中へは入れられず、子を持つ箱はフローチャートへ入れられない", () => {
  const { graph, events } = setup(data());
  expect(() => graph.reparent(11, 2)).toThrow();
  expect(graph.reparent(12, 1)).toBe(false);
  expect(events).toContain("leafKids");
  expect(graph.toJSON().nodes.find(n => n.id === 12)!.parent).toBeUndefined();
  // 子の無い箱なら入れられる
  expect(graph.reparent(11, 1)).toBe(true);
});

test("子を持つ子がある箱は、フローチャートにできない（選べない見せ方として知らせる）", () => {
  const { graph } = setup({ nodes: [{ id: 1, caption: "A" }, { id: 2, caption: "B", parent: 1 }, { id: 3, caption: "C", parent: 2 }] });
  expect(info(graph, 1).viewsOff).toEqual(["flow"]);
  expect(() => graph.update(1, { childView: "flow" })).toThrow();
  expect(info(graph, 2).viewsOff).toEqual([]);
});

test("データの検査: フローチャートの子が子を持つと誤り", () => {
  const bad = { nodes: [{ id: 1, childView: "flow" }, { id: 2, parent: 1 }, { id: 3, parent: 2 }] };
  expect(problems(bad).some(p => p.includes("フローチャート"))).toBe(true);
  expect(problems(data())).toEqual([]);
});

test("道具入れは、フローチャートの箱とその子を選んだときに、フローチャートの箱に出す", () => {
  const { graph } = setup(data());
  expect(info(graph, 1).tools?.id).toBe("1");
  expect(info(graph, 3).tools?.id).toBe("1");
  expect(info(graph, 3).tools?.shapes).toEqual(["box", "diamond", "circle", "hexagon", "parallelogram", "trapezoid", "db"]);
  expect(info(graph, 10).tools).toBeNull();
  expect(graph.kidShapes("1")).toContain("parallelogram");
  expect(graph.kidShapes(null)).not.toContain("parallelogram");
});

test("フローチャートのひし形から出る線には、キャプションの候補 Yes / No を出す", () => {
  const { graph } = setup(data());
  expect((graph.edgeInfo("e1") as EdgeInfo).captionHints).toEqual(["Yes", "No"]);
  expect((graph.edgeInfo("e2") as EdgeInfo).captionHints).toEqual([]);
});

test("ワールド（ページ）もフローチャートにでき、最上位の箱がフローチャートの形を使える。最上位の箱は子を持てない", () => {
  const { graph, events } = setup({
    nodes: [{ id: 1, caption: "準備", shape: "hexagon", x: 40, y: 40 }, { id: 2, caption: "外", x: 300, y: 40 }],
  });
  expect(info(graph, 1).shape).toBe("box");
  expect((graph.info(null) as { views: string[] }).views).toEqual(["nest", "flow"]);
  graph.update(null, { childView: "flow" });
  expect(graph.toJSON().world?.childView).toBe("flow");
  expect(info(graph, 1).shape).toBe("hexagon");
  expect(info(graph, 1).tools).toEqual({ id: null, shapes: ["box", "diamond", "circle", "hexagon", "parallelogram", "trapezoid", "db"], size: "M" });
  expect(() => graph.reparent(2, 1)).toThrow();
  expect(() => graph.update(null, { childView: "tree" })).toThrow();
  // 最上位に子を持つ箱があれば、フローチャートにできない
  const other = setup({ nodes: [{ id: 1, caption: "A" }, { id: 2, caption: "B", parent: 1 }] });
  expect((other.graph.info(null) as { viewsOff: string[] }).viewsOff).toEqual(["flow"]);
  expect(problems({ world: { childView: "flow" }, nodes: [{ id: 1 }, { id: 2, parent: 1 }] }).length).toBeGreaterThan(0);
  expect(problems({ world: { childView: "list" }, nodes: [] }).length).toBeGreaterThan(0);
  expect(events).toEqual([]);
});

test("形の切り替え: 円と角丸、平行四辺形と台形の向きは、データでは別の形の値", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, childView: "flow", x: 0, y: 0 },
      { id: 2, parent: 1, shape: "stadium", caption: "開始" },
      { id: 3, parent: 1, shape: "parallelogramAlt" },
      { id: 4, parent: 1, shape: "trapezoidAlt" },
      { id: 5, shape: "stadium", x: 600, y: 0 },
    ],
  });
  expect([2, 3, 4, 5].map(id => info(graph, id).shape)).toEqual(["stadium", "parallelogramAlt", "trapezoidAlt", "stadium"]);
  graph.update(2, { shape: "circle" });
  expect(graph.toJSON().nodes.find(n => n.id === 2)!.shape).toBe("circle");
});

test("ワールドに掛けられる見せ方の一覧（validate.ts の WORLD_VIEWS）は、戦略の表の onWorld と同じ", () => {
  expect<string[]>([...WORLD_VIEWS]).toEqual(VIEWS.filter(v => STRATEGIES[v].onWorld));
});

test("分岐の頂点の割り当て: 1 つの頂点から 2 本出さず、相手の向きに合う頂点を選ぶ（下と右の組み合わせもある）。入ってくる線の頂点は避ける", () => {
  expect(splitBranches([[0, 200], [200, 150]])).toEqual(["b", "r"]);   // 真下と右下なら、下と右
  expect(splitBranches([[0, 150], [0, 150]])).toEqual(["b", "r"]);     // 同じ向きでも別の頂点
  expect(splitBranches([[-100, 150], [0, 200], [100, 150]])).toEqual(["l", "b", "r"]);
  expect(splitBranches([[200, -150], [0, 200]], ["t"])).toEqual(["r", "b"]); // 上から入ってくるなら、上には出さない
  expect(splitBranches([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1]])).toEqual([null, null, null, null, null]);
});

test("フローチャートの分岐から出る線は、1 つの頂点から 2 本出さない。端を固定した線と、フローチャートの外の分岐は今までどおり", () => {
  const nodes = (flow: boolean): Diagram["nodes"] => [
    { id: 1, ...(flow ? { childView: "flow" as const } : {}), x: 0, y: 0 },
    { id: 2, parent: 1, shape: "diamond", caption: "?", x: 200, y: 20 },
    { id: 3, parent: 1, caption: "Yes", x: 20, y: 260 },
    { id: 4, parent: 1, caption: "No", x: 400, y: 260 },
  ];
  const edges = [{ id: "e1", from: 2, to: 3 }, { id: "e2", from: 2, to: 4 }];
  const start = (el: HTMLElement, id: string) =>
    el.querySelector(`.mz-edge[data-id="${id}"] polyline`)!.getAttribute("points")!.trim().split(/\s+/)[0]!.split(",").map(Number);
  const flow = setup({ nodes: nodes(true), edges });
  expect(start(flow.el, "e1")).not.toEqual(start(flow.el, "e2")); // 別の頂点から出る
  const plain = setup({ nodes: nodes(false), edges });
  expect(start(plain.el, "e1")).toEqual(start(plain.el, "e2")); // フローチャートの外は一か所（下の頂点）から
});

test("整列の決まり（flow-align.ts）: 本筋は中央の縦の線にそろい、分岐の枝は右、合流する箱は枝の後の段", () => {
  const item = (id: string, w = 100, h = 60, start = false) => ({ id, w, h, start });
  const pos = alignFlow(
    [item("s", 120, 60, true), item("a"), item("d", 160, 80), item("y"), item("n", 140, 60)],
    [{ from: "s", to: "a" }, { from: "a", to: "d" }, { from: "d", to: "y" }, { from: "d", to: "n" }, { from: "n", to: "y" }],
    { centerX: 500, top: 20, gapX: 60, gapY: 40 },
  );
  const cx = (id: string, w: number) => pos.get(id)!.x + w / 2;
  expect([cx("s", 120), cx("a", 100), cx("d", 160), cx("y", 100)]).toEqual([500, 500, 500, 500]);
  expect(cx("n", 140)).toBeGreaterThan(500);          // 枝は右の列
  expect(pos.get("y")!.y).toBeGreaterThan(pos.get("n")!.y); // 合流する箱は枝の後
  expect(pos.get("s")!.y).toBe(20);
});

test("LLM が位置を書かずにフローチャートを書き出したら整列して置く。位置のある箱が 1 つでもあれば使わない。自動で整列のボタンでも同じ並べ方", () => {
  const nodes = (pos: boolean): Diagram["nodes"] => [
    { id: 1, childView: "flow", x: 0, y: 0 },
    { id: 2, parent: 1, shape: "stadium", caption: "開始", ...(pos ? { x: 300, y: 20 } : {}) },
    { id: 3, parent: 1, caption: "処理" },
    { id: 4, parent: 1, caption: "終了", shape: "stadium" },
  ];
  const edges = [{ id: "e1", from: 2, to: 3 }, { id: "e2", from: 3, to: 4 }];
  const center = (g: Graph, id: number) => info(g, id).x + info(g, id).w / 2;
  const auto = setup({ nodes: nodes(false), edges });
  expect(new Set([2, 3, 4].map(id => center(auto.graph, id))).size).toBe(1);
  expect(info(auto.graph, 2).y).toBeLessThan(info(auto.graph, 3).y);
  const placed = setup({ nodes: nodes(true), edges });
  expect(info(placed.graph, 2).x).toBe(300);
  expect(info(placed.graph, 1).canAlign).toBe(true);
  expect(placed.graph.autoAlign(1)).toBe(true);
  expect(new Set([2, 3, 4].map(id => center(placed.graph, id))).size).toBe(1);
  placed.graph.undo();
  expect(info(placed.graph, 2).x).toBe(300);
});

test("フローチャートの線はなるべく同じ位置につながない: 折れ目の少ない線が辺を取り、負けた線は空いている近い辺へ。フローチャートの外は今までどおり", () => {
  // 3 の真下に 5、右上に 4。3→5 はまっすぐ（折れ目 0）、4→5 は 5 の上で合流しがち
  const nodes = (flow: boolean): Diagram["nodes"] => [
    { id: 1, ...(flow ? { childView: "flow" as const } : {}), x: 0, y: 0 },
    { id: 3, parent: 1, caption: "上", x: 200, y: 20 },
    { id: 4, parent: 1, caption: "右上", x: 420, y: 160 },
    { id: 5, parent: 1, caption: "下", x: 200, y: 320 },
  ];
  const edges = [{ id: "e1", from: 3, to: 5 }, { id: "e2", from: 4, to: 5 }];
  const end = (el: HTMLElement, id: string) => el.querySelector(`.mz-edge[data-id="${id}"] polyline`)!.getAttribute("points")!.trim().split(/\s+/).at(-1)!;
  const flow = setup({ nodes: nodes(true), edges });
  expect(end(flow.el, "e1")).not.toBe(end(flow.el, "e2"));
  const [x2] = end(flow.el, "e2").split(",").map(Number);
  const box = info(flow.graph, 5), parent = info(flow.graph, 1);
  expect(x2).toBe(parent.x + box.x + box.w); // 右の辺に入る（遠い左の辺は使わない。位置は親の中なので親の位置を足す）
  const plain = setup({ nodes: nodes(false), edges });
  expect(end(plain.el, "e1")).toBe(end(plain.el, "e2")); // フローチャートの外は、同じ位置で合流したまま
});

test("中の箱のサイズ: 全部を一度にそのサイズにし、サイズに合わせた間隔で整列し直す。1 回の Undo で戻り、そのあとも箱ごとに変えられる", () => {
  const data = (): Diagram => ({
    nodes: [
      { id: 1, childView: "flow", x: 0, y: 0 },
      { id: 2, parent: 1, shape: "stadium", caption: "開始", size: "L", x: 300, y: 20 },
      { id: 3, parent: 1, caption: "処理", x: 40, y: 200 },
      { id: 4, parent: 1, caption: "終了", shape: "stadium", x: 500, y: 400 },
    ],
    edges: [{ id: "e1", from: 2, to: 3 }, { id: "e2", from: 3, to: 4 }],
  });
  const { graph } = setup(data());
  const gap = (g: Graph) => info(g, 3).y - (info(g, 2).y + info(g, 2).h);
  expect(info(graph, 1).kidSize).toBeNull();
  expect(graph.setKidSize(1, "S")).toBe(true);
  expect([2, 3, 4].map(id => info(graph, id).size)).toEqual(["S", "S", "S"]);
  expect(info(graph, 1).kidSize).toBe("S");
  const small = gap(graph);
  graph.setKidSize(1, "L");
  expect(gap(graph)).toBeGreaterThan(small);                              // L は段の間が広い
  expect(new Set([2, 3, 4].map(id => info(graph, id).x + info(graph, id).w / 2)).size).toBe(1); // 整列し直してある
  expect(info(graph, 1).tools?.size).toBe("L");                           // 道具入れから足す箱のサイズ
  graph.update(3, { size: "M" });                                         // 箱ごとに変えられる
  expect(info(graph, 3).size).toBe("M");
  graph.undo();
  graph.undo();
  expect([2, 3, 4].map(id => info(graph, id).size)).toEqual(["S", "S", "S"]);
  expect(problems({ ...data(), world: { kidSize: "XL" } }).length).toBeGreaterThan(0);
});

test("フローチャートの線は折れ目の一番少ない形: 斜めに並ぶ箱どうしでも Z 字（2 回）ではなく L 字（1 回）", () => {
  const r = {
    a: { x: 759, y: 336, w: 86, h: 44 }, b: { x: 587, y: 412, w: 72, h: 44 }, elbow: true, via: null, obstacles: [], margin: 12,
    exitAt: null, enterAt: null, aVertex: true, bVertex: false, memory: null,
  };
  expect(route(r).bends).toBe(2);
  expect(fewestRoute(r)!.bends).toBe(1);
});

test("フローチャートの S の箱は、キャプションを切り詰めずに折り返し、高さを文字に合わせる（外の S は 10 文字で切って高さは決まったまま）", () => {
  const long = "とても長いキャプションを持つ処理の箱です";
  const { el, graph } = setup({
    nodes: [
      { id: 1, childView: "flow", x: 0, y: 0 }, { id: 2, parent: 1, caption: long, size: "S", x: 20, y: 40 },
      { id: 3, caption: long, size: "S", x: 600, y: 40 },
    ],
  });
  const text = (id: number) => el.querySelector(`.mz-node[data-id="${id}"] > .mz-head .mz-text`)!.textContent;
  expect(text(2)).toBe(long);
  expect(info(graph, 2).h).toBeGreaterThan(44);
  expect(text(3)).not.toBe(long);
  expect(info(graph, 3).h).toBe(44);
});

test("フローチャートの箱は、大きさが変わっても横の中心を保つ（テーマやキャプションで幅が変わっても、そろえた中心の線が折れない）", () => {
  const { graph } = setup({
    nodes: [
      { id: 1, childView: "flow", x: 0, y: 0 }, { id: 2, parent: 1, caption: "開始", shape: "stadium", x: 100, y: 20 },
    ],
  });
  const cx = (id: number) => info(graph, id).x + info(graph, id).w / 2;
  const before = cx(2);
  graph.update(2, { caption: "とても長いキャプションに変えた開始" });
  expect(cx(2)).toBeCloseTo(before, 0);
});
