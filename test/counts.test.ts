// 処理の回数のテスト。配置のリファクタ（docs/REFACTOR-layout.md）で、文字を測る回数（ブラウザに配置を計算し直させる、
// 一番重い処理）と重なりの判定の回数が増えていないことを確かめる。時間は環境でぶれるので回数で見る。
// 基準の値は 119f164 の時点のもの。減ったら基準を下げてよい（増えたら理由を確かめる）
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { layoutStats } from "../web/src/layout";
import type { BoxData, Diagram } from "../web/src/types";
import { dragBy } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

// グループ g の id。グループ 1 つにつき、自分・文字の箱 10 個・ツリーの子 2 個の 13 個
const groupId = (g: number) => 1 + g * 13;
const kidId = (g: number, k: number) => groupId(g) + 1 + k;

// 最上位のグループ 20 個（それぞれ文字の箱 10 個、うち 1 つはツリーの小グループ）。全部で 260 個ほど。
// 文字の測った結果はモジュール全体で使い回されるので、ほかのテストと重ならないキャプションにする
function big(): Diagram {
  const nodes: BoxData[] = [];
  const edges: [number, number][] = [];
  let id = 1;
  for (let g = 0; g < 20; g++) {
    const gid = id++;
    nodes.push({ id: gid, caption: `計測グループ${g}`, x: 40 + (g % 5) * 700, y: 40 + Math.floor(g / 5) * 600 });
    for (let k = 0; k < 10; k++) {
      const kid = id++;
      nodes.push({ id: kid, caption: `計測${g}-${k}${"あ".repeat(k * 3)}`, parent: gid });
      if (k > 0) edges.push([kid - 1, kid]);
      if (k === 9) {
        nodes.at(-1)!.childView = "tree";
        nodes.push({ id: id++, caption: `計測木${g}-a`, parent: kid }, { id: id++, caption: `計測木${g}-b`, parent: kid });
      }
    }
    if (g > 0) edges.push([groupId(g - 1), gid]);
  }
  return { world: { width: 3600 }, nodes, edges };
}

function count(run: () => void) {
  layoutStats.measures = 0;
  layoutStats.overlapChecks = 0;
  run();
  return { ...layoutStats };
}

test("大きな図での処理の回数が、基準を超えない", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let graph!: Graph;
  const out = {
    load: count(() => { graph = createGraph(el, big()); graphs.push(graph); }),
    settings: count(() => {
      graph.update(kidId(0, 0), { caption: "計測で長くしたキャプション".repeat(4) });
      graph.update(kidId(0, 0), { size: "L" });
      graph.update(groupId(0), { childView: "tree" });
      graph.update(groupId(0), { childView: "nest" });
      graph.update(kidId(1, 9), { childView: "hidden" });
    }),
    drag: count(() => {
      dragBy(el, graph, kidId(0, 1), 200, 150); // 中身を動かして親を広げる
      dragBy(el, graph, kidId(1, 0), 0, 300);
      dragBy(el, graph, groupId(2), 300, 0); // 最上位を動かす
    }),
    fit: count(() => graph.fitChildren(groupId(0), "both")),
    reload: count(() => graph.load(graph.toJSON(), { keepHistory: true })),
  };
  // 119f164 の時点の回数
  const base = {
    load: { measures: 480, overlapChecks: 50770 },
    settings: { measures: 6, overlapChecks: 237072 },
    drag: { measures: 0, overlapChecks: 1785 },
    fit: { measures: 0, overlapChecks: 49829 },
    reload: { measures: 0, overlapChecks: 1090 },
  };
  const over = Object.entries(out).flatMap(([scene, v]) =>
    (["measures", "overlapChecks"] as const)
      .filter(k => v[k] > base[scene as keyof typeof base][k])
      .map(k => `${scene}.${k}: ${v[k]}（基準 ${base[scene as keyof typeof base][k]}）`));
  expect(over).toEqual([]);
});
