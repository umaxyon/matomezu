// 配置の場面ごとの動きを固定するテスト（docs/REFACTOR-layout.md の場面の表の行ごと）。
// 配置の処理を組み替えても、各場面の操作列の結果（全ボックスの位置と大きさ）が変わらないことを確かめる。
// 振る舞いを意図して変えたとき以外は、スナップショットを更新しない
import { afterEach, describe, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram, Id, Patch } from "../web/src/types";
import { dragBy, example, fakeMeasure, frames } from "./helpers";

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

// 操作を順に行い、各操作のあとの全ボックスの枠を記録する
type Step = [string, (g: Graph, el: HTMLElement) => void];
function record(data: Diagram, steps: Step[]) {
  const { el, graph } = setup(data);
  const out = [`# 開いた直後\n${frames(el).join("\n")}`];
  for (const [name, run] of steps) {
    run(graph, el);
    out.push(`# ${name}\n${frames(el).join("\n")}`);
  }
  return out.join("\n\n");
}
const set = (id: Id, p: Patch): Step => [`${id} ${JSON.stringify(p)}`, g => g.update(id, p)];

// three-levels.json の id: 3 フロントエンド、4 Web、5 トップ画面、6 カート画面、7 モバイル、
// 10 バックエンド、17 外部サービス（ツリー）
const LONG = "トップ画面あいうえおかきくけこさしすせそたちつてと";

describe("場面ごとの操作列", () => {
  test("開いたとき", () => {
    const overlapped: Diagram = {
      nodes: [
        { id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 60, y: 50 }, { id: 3, caption: "C", x: 50, y: 60 },
        { id: 4, caption: "枠", x: 400, y: 40 },
        { id: 5, caption: "位置なし1", parent: 4 }, { id: 6, caption: "位置なし2", parent: 4 },
        { id: 7, caption: "位置あり", parent: 4, x: 12, y: 30 },
        { id: 8, caption: "位置なしの最上位" },
      ],
    };
    const out = [example("three-levels"), example("nested"), overlapped]
      .map(d => record(d, []));
    expect(out.join("\n\n====\n\n")).toMatchSnapshot();
  });

  test("設定変更（グループの中）", () => {
    expect(record(example("three-levels"), [
      set(5, { caption: LONG }),
      set(5, { size: "L" }), set(5, { size: "S" }), set(5, { size: "M" }),
      set(5, { caption: "トップ画面" }),
      set(5, { shape: "db" }), set(5, { shape: "person" }), set(5, { shape: "box" }),
      set(4, { childView: "tree" }), set(4, { treeDirection: "right" }), set(4, { childView: "hidden" }),
      set(4, { childView: "nest" }),
      set(6, { overflow: "clip" }), set(6, { overflow: "wrap" }),
      set(4, { fill: false }), set(4, { border: false }),
    ])).toMatchSnapshot();
  });

  test("設定変更（最上位）", () => {
    expect(record(example("three-levels"), [
      set(3, { childView: "tree" }), set(3, { childView: "nest" }),
      set(3, { childView: "hidden" }), set(3, { childView: "tree" }), set(3, { treeDirection: "left" }),
      set(3, { childView: "nest" }),
      set(17, { treeDirection: "up" }), set(17, { childView: "nest" }), set(17, { childView: "hidden" }),
      set(10, { childView: "tree" }), set(10, { childView: "nest" }),
      set(2, { caption: "とても長い名前のユーザーのボックス" }), set(2, { size: "S" }),
    ])).toMatchSnapshot();
  });

  test("縮んだら押し下げた相手を戻す", () => {
    expect(record(example("three-levels"), [
      set(5, { caption: LONG.repeat(3) }),
      set(5, { caption: LONG }),
      set(5, { caption: "トップ画面" }),
      set(5, { caption: LONG.repeat(6) }), // フロントエンドが伸び、下の最上位も押し下げる
      set(5, { caption: "トップ画面" }),
    ])).toMatchSnapshot();
  });

  test("読み直し・Undo", () => {
    const changed = (): Diagram => {
      const d = example("three-levels");
      const cart = d.nodes.find(n => n.id === 6)!;
      cart.x = 12; cart.y = 110; // 移動
      d.nodes = d.nodes.filter(n => n.id !== 7 && n.parent !== 7); // モバイルを消す
      const ids = new Set(d.nodes.map(n => n.id));
      d.edges = d.edges!.filter(e => !Array.isArray(e) && ids.has(e.from) && ids.has(e.to));
      d.nodes.push({ id: 90, caption: "新しい箱", parent: 3 }, { id: 91, caption: "新しい最上位" }); // 位置なし
      return d;
    };
    expect(record(example("three-levels"), [
      set(4, { caption: "ユーザーの変更" }), // ユーザーが触ったあとなので、外部の変更も履歴に積まれる
      ["外部の変更を読み直す", g => g.load(changed(), { keepHistory: true })],
      set(5, { caption: LONG }),
      ["Undo", g => g.undo()],
      ["Undo", g => g.undo()],
      ["Redo", g => g.redo()],
      ["開き直す", g => g.load(example("three-levels"))],
    ])).toMatchSnapshot();
  });

  test("子のサイズをそろえる", () => {
    expect(record(example("three-levels"), [
      set(5, { caption: LONG }),
      ["4 の幅", g => g.fitChildren(4, "width")],
      ["3 の両方", g => g.fitChildren(3, "both")],
      ["10 の高さ", g => g.fitChildren(10, "height")],
      ["Undo", g => g.undo()],
    ])).toMatchSnapshot();
  });

  test("はみ出しの調整（最初に開いたとき）", () => {
    const wide: Diagram = {
      nodes: [
        { id: 1, caption: "左", x: 40, y: 40 },
        { id: 2, caption: "右端（つながる）", x: 900, y: 40 },
        { id: 3, caption: "右端（つながらない）", x: 950, y: 200 },
        { id: 4, caption: "左から大きい", x: 300, y: 300, width: 800 },
      ],
      edges: [[1, 2]],
    };
    expect(record(wide, [
      ["ドラッグ", (g, el) => dragBy(el, g, 2, 40, 0)],
      ["外部の変更を読み直す（調整しない）", g => g.load(wide, { keepHistory: true })],
    ])).toMatchSnapshot();
  });

  test("ドラッグ中", () => {
    expect(record(example("three-levels"), [
      ["5 を右下へ（Web とフロントエンドが下へ伸び、下の最上位を押す）", (g, el) => dragBy(el, g, 5, 120, 160)],
      ["6 を左の空いた場所へ", (g, el) => dragBy(el, g, 6, -200, 0)],
      ["6 を 5 に重ねる（5 と入れ替わる）", (g, el) => dragBy(el, g, 6, 120, 160)],
      ["4 を右へ（Web とモバイルが入れ替わる）", (g, el) => dragBy(el, g, 4, 300, 0)],
      ["7 を下へ（フロントエンドが広がり、下の最上位を押す）", (g, el) => dragBy(el, g, 7, 0, 300)],
      ["3 を右へ", (g, el) => dragBy(el, g, 3, 200, 0)],
      ["2 を 3 に浅く重ねる（3 の幅の 4 分の 1 まで食い込まないので入れ替わらず、離すと 2 が 3 の手前へ戻る）", (g, el) => dragBy(el, g, 2, 300, 0)],
      ["Undo", g => g.undo()],
    ])).toMatchSnapshot();
  });
});

describe("場面の表の行のうち、テストが無かったもの", () => {
  test("位置の無い入れ子の子は、左上から格子状に置く", () => {
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "枠", x: 40, y: 40 },
        { id: 2, caption: "a", parent: 1 }, { id: 3, caption: "b", parent: 1 },
        { id: 4, caption: "c", parent: 1 }, { id: 5, caption: "d", parent: 1 },
      ],
    });
    const at = (id: number) => [graph.info(id).x, graph.info(id).y];
    const cw = 120 + 8, ch = 64 + 8; // 一番大きい子 + 間隔
    expect([at(2), at(3), at(4), at(5)]).toEqual([[12, 30], [12 + cw, 30], [12, 30 + ch], [12 + cw, 30 + ch]]);
  });

  test("外部の変更の読み直しでは、位置のあるボックスは動かず、位置の無いボックスは空きに置く", () => {
    const d = (extra: boolean): Diagram => ({
      nodes: [
        { id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 300, y: 40 },
        ...(extra ? [{ id: 3, caption: "新しい" }] : []),
      ],
    });
    const { graph } = setup(d(false));
    graph.load(d(true), { keepHistory: true });
    expect([graph.info(1).x, graph.info(1).y, graph.info(2).x, graph.info(2).y]).toEqual([40, 40, 300, 40]);
    const n = graph.info(3);
    for (const id of [1, 2]) {
      const o = graph.info(id);
      expect(n.x + n.w <= o.x || o.x + o.w <= n.x || n.y + n.h <= o.y || o.y + o.h <= n.y).toBe(true);
    }
  });

  test("位置の無い大きいボックスは、表示領域が狭くて近くに空きが無くても、重ならないよう下に置く", () => {
    // 表示領域 700 で 600x400 を 4 つ。近くを探す範囲（ワールドの幅か高さ）に入りきらず、以前は重ねて置いていた
    const proto = HTMLElement.prototype;
    Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 700 });
    try {
      const { graph } = setup({
        nodes: [1, 2, 3, 4].map(id => ({ id, caption: `箱 ${id}`, width: 600, height: 400 })),
      });
      const r = [1, 2, 3, 4].map(id => graph.info(id));
      for (const a of r) for (const b of r) {
        if (a === b) continue;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    } finally {
      Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 1000 });
    }
  });

  describe("はみ出しの調整で動かした箱は、ファイルの位置が変わらない限り、読み直しても画面の位置のまま", () => {
    // 2 は右端からはみ出すので、開いたときに 1 の真下へ移る（表示だけ。ファイルは x: 900 のまま）
    const d = (caption: string, x = 900): Diagram => ({
      nodes: [{ id: 1, caption, x: 40, y: 40 }, { id: 2, caption: "右端", x, y: 40 }],
      edges: [[1, 2]],
    });
    const at = (g: Graph, id: number) => [g.info(id).x, g.info(id).y];

    test("ユーザーが触る前に LLM がほかの箱を直しても、飛ばない", () => {
      const { graph } = setup(d("A"));
      const shown = at(graph, 2);
      expect(shown[0]).toBeLessThan(900);
      graph.load(d("A（LLM が直した）"), { keepHistory: true });
      expect(at(graph, 2)).toEqual(shown);
      graph.load(d("A（もう一度）"), { keepHistory: true });
      expect(at(graph, 2)).toEqual(shown);
    });

    test("LLM がその箱の位置を変えたら、データの位置に置く", () => {
      const { graph } = setup(d("A"));
      graph.load(d("A", 600), { keepHistory: true });
      expect(at(graph, 2)).toEqual([600, 40]);
    });

    test("ユーザーが図を変えて保存したあとは、保存した位置と比べる（元の位置に戻されたら、その位置に置く）", () => {
      const { el, graph } = setup(d("A"));
      dragBy(el, graph, 1, 0, 20);
      graph.load(d("A"), { keepHistory: true });
      expect(at(graph, 2)).toEqual([900, 40]);
    });

    test("押し下げられた分は残さない（ほかの箱を伸ばして戻すと、元の配置に戻る）", () => {
      // docs/DIST-TRIAL.md の Windows での確認。17 外部サービスは開いたときに移り、3 をツリーにすると 10 と 17 が押し下げられる
      const data = example("three-levels");
      const { graph } = setup(data);
      const before = [at(graph, 10), at(graph, 17)];
      expect(before[1]![0]).toBeLessThan(860);
      const tree = JSON.parse(JSON.stringify(data)) as Diagram;
      tree.nodes.find(n => n.id === 3)!.childView = "tree";
      graph.load(tree, { keepHistory: true });
      expect(at(graph, 17)[0]).toBe(before[1]![0]);
      graph.load(data, { keepHistory: true });
      expect([at(graph, 10), at(graph, 17)]).toEqual(before);
    });
  });

  // 今の振る舞いを固定する（見直す候補: docs/REFACTOR-layout.md の 6 章）
  test("押し下げられた位置は保存されるので、読み直すとそれが本来いたい高さになる（そのあと縮んでも上がらない）", () => {
    const { graph } = setup(example("three-levels"));
    graph.update(5, { caption: LONG });
    const pushed = graph.info(6).y;
    graph.load(graph.toJSON(), { keepHistory: true });
    graph.update(5, { caption: "トップ画面" });
    expect(graph.info(6).y).toBe(pushed);
  });
});

describe("開いたときに押し下げた位置（docs/LAYOUT-PENDING.md の 3）", () => {
  test("データの位置が重なって押し下げられた箱は、あとで上が空いても上がらない", () => {
    // three-levels.json のフロントエンド（3）はデータ上 y=80 で、タイトル（1）と間隔 8px 分重なるので 88 に押し下げられる
    const { graph } = setup(example("three-levels"));
    expect(graph.info(3).y).toBe(88);
    graph.update(1, { size: "S" }); // タイトルが低くなり、上が空く
    expect(graph.info(3).y).toBe(88);
  });
});
