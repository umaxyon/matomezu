// 配置の動きを固定するテスト。配置の処理を整理するときに、動きが変わっていないことを確かめる。
// ランダムな操作で崩れないかは test/layout-random-*.test.ts（重いので、配置に関係しない修正では飛ばす。package.json の test:quick）
import { afterEach, describe, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram } from "../web/src/types";
import { dragBy, fakeMeasure, PLAIN_GAPS, frames, violations } from "./helpers";
import { random, randomOp, sample } from "./random-ops";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram, paper = true) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure, ...PLAIN_GAPS, paper });
  graphs.push(graph);
  return { el, graph };
}

test("決まった操作の結果（全ボックスの位置と大きさ）が変わらない", () => {
  const rnd = random(424242);
  const { el, graph } = setup(sample());
  const steps: string[] = [frames(el).join("\n")];
  for (let i = 0; i < 60; i++) {
    const op = randomOp(el, graph, rnd);
    steps.push(`# ${op}\n${frames(el).join("\n")}`);
  }
  expect(steps.join("\n\n")).toMatchSnapshot();
}, 60000);

describe("大きさや見せ方が変わっても、内包のページでは左上を保つ（ページの起点。docs/PAPER-plan.md の 4.6）", () => {
  // 線は、真横や真下の相手とは水平・垂直のまま保たれる（graph.test.ts の「線のつなぎ方」）
  test("最上位も左上を保つ。見せ方を何度切り替えても元に戻り、上の相手も押し下げない", () => {
    // 見せ方（箱の childView）を内包・非表示・リストで切り替える（ページのパターンは後から変えない）
    const { graph } = setup(sample());
    const at = (id: number) => [graph.info(id).x, graph.info(id).y];
    const title = at(1), front = at(3), user = at(2), back = at(10);
    for (const v of ["hidden", "nest", "hidden", "nest"] as const) {
      graph.update(3, { childView: v });
      expect(at(3)).toEqual(front); // 左上は動かない
      expect([at(1), at(2)]).toEqual([title, user]);
    }
    expect(at(3)).toEqual(front);
    expect(at(10)).toEqual(back); // 広がったときに押し下げたバックエンドも戻る
  });

  test("入れ子の中で非表示から内包にして広がっても、下の相手との間で上に余白を作らない", () => {
    // データ枠の中で、DB（API を内包）の右下にキャッシュがつながっている
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "データ", x: 40, y: 40 },
        { id: 2, caption: "DB", parent: 1, childView: "hidden", x: 12, y: 36 },
        { id: 3, caption: "API", parent: 2, x: 12, y: 36 },
        { id: 4, caption: "認証", parent: 3, size: "S" }, { id: 5, caption: "注文", parent: 3, size: "S" },
        { id: 6, caption: "キャッシュ", parent: 1, x: 150, y: 330 },
      ],
      edges: [[2, 6]],
    } as Diagram);
    const before = graph.info(2);
    graph.update(2, { childView: "nest" });
    const after = graph.info(2);
    expect(after.y).toBeLessThanOrEqual(before.y);
    const cache = graph.info(6);
    expect(cache.y).toBeGreaterThanOrEqual(after.y + after.h); // キャッシュは下へずれる
  });
});

describe("押しのけ", () => {

  test("押した相手の下にある箱も、続けて下へ押す", () => {
    const { el, graph } = setup({
      nodes: [
        { id: 1, caption: "枠", x: 40, y: 40 },
        { id: 2, caption: "中", parent: 1, x: 12, y: 30 },
        { id: 8, caption: "下1", x: 40, y: 160 },
        { id: 9, caption: "下2", x: 40, y: 240 },
      ],
    });
    dragBy(el, graph, 2, 0, 150);
    const g = graph.info(1), a = graph.info(8), b = graph.info(9);
    expect(a.y).toBeGreaterThanOrEqual(g.y + g.h);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
    expect([a.x, b.x]).toEqual([40, 40]);
  });

  test("孫を動かして祖父母が広がったら、祖父母の階層で押しのける", () => {
    const { el, graph } = setup({
      nodes: [
        { id: 1, caption: "祖父母", x: 40, y: 40 },
        { id: 2, caption: "親", parent: 1, x: 12, y: 30 },
        { id: 3, caption: "孫", parent: 2, x: 12, y: 30 },
        { id: 9, caption: "隣", x: 40, y: 260 },
      ],
    });
    const before = graph.info(9).y;
    dragBy(el, graph, 3, 0, 120);
    const g = graph.info(1), n = graph.info(9);
    expect(n.y).toBeGreaterThan(before);
    expect(n.y).toBeGreaterThanOrEqual(g.y + g.h);
  });
});

test("読み込んだデータの位置が重なっていれば、後ろのボックスを下へずらす", () => {
  const { el, graph } = setup({
    nodes: [
      { id: 1, caption: "先", x: 100, y: 100 },
      { id: 2, caption: "後", x: 120, y: 110 },
      { id: 3, caption: "枠", x: 400, y: 100 },
      { id: 31, caption: "中A", parent: 3, x: 12, y: 30 }, { id: 32, caption: "中B", parent: 3, x: 20, y: 40 },
    ],
  });
  expect(violations(el)).toEqual([]);
  expect([graph.info(1).x, graph.info(1).y]).toEqual([100, 100]); // 先に書かれた方はそのまま
  expect(graph.info(2).x).toBe(120); // 後の方は同じ x のまま下へ
  expect(graph.info(2).y).toBeGreaterThanOrEqual(100 + graph.info(1).h);
  expect(graph.info(32).x).toBe(20);
});

describe("縮んだら、押し下げた相手を元の位置へ戻す", () => {
  const long = "トップ画面あいうえおかきくけこさしすせそ";
  const data = (): Diagram => ({
    nodes: [
      { id: 1, caption: "Web", x: 40, y: 200 },
      { id: 2, caption: "トップ画面", parent: 1, x: 12, y: 30 },
      { id: 3, caption: "カート画面", parent: 1, x: 140, y: 30 },
    ],
    edges: [[2, 3]],
  });
  const at = (graph: Graph, id: number) => [graph.info(id).x, graph.info(id).y];

  test("文字を長くして押した兄弟は（横に並んでいれば右へ）、文字を戻すと元の位置へ戻り、親も元の大きさに戻る", () => {
    const { graph } = setup(data());
    const cart = at(graph, 3), web = graph.info(1);
    graph.update(2, { caption: long });
    expect(at(graph, 3)[0]).toBeGreaterThan(cart[0]!); // 右へ押される
    expect(at(graph, 3)[1]).toBe(cart[1]!); // 下へはずれない（折り返さない）
    graph.update(2, { caption: "トップ画面" });
    expect(at(graph, 3)).toEqual(cart);
    expect([graph.info(1).w, graph.info(1).h]).toEqual([web.w, web.h]);
  });

  test("押し下げた相手との間隔は、ドラッグ以外の場面でもちょうど 8px（ずらす量の刻みで間隔がばらつかない）", () => {
    const { graph } = setup(data());
    for (const n of [1, 2, 3, 5, 8]) {
      graph.update(2, { caption: long.repeat(n) });
      const top = graph.info(2), cart = graph.info(3);
      if (cart.y > 30) expect(cart.y - (top.y + top.h)).toBe(8);
    }
  });

  test("縮んでも元の位置が空かなければ、空いたところまで上がる", () => {
    // 縦に並べる（カート画面はトップ画面の下）
    const { graph } = setup({ ...data(), nodes: data().nodes.map(n => (n.id === 3 ? { ...n, x: 12, y: 110 } : n)) });
    graph.update(2, { caption: long.repeat(8) }); // 高く伸びて大きく押し下げる
    const pushed = at(graph, 3)[1]!;
    graph.update(2, { caption: long.repeat(5) }); // 少し低くなる（まだ元の位置とは重なる）
    const y = at(graph, 3)[1]!;
    expect(y).toBeLessThan(pushed);
    expect(y).toBeGreaterThan(110);
  });

  test("最上位でも、広がって押し下げた相手は縮むと戻る", () => {
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "Web", x: 40, y: 40 },
        { id: 2, caption: "トップ画面", parent: 1, x: 12, y: 30 },
        { id: 9, caption: "下の箱", x: 40, y: 160 },
      ],
    });
    const below = at(graph, 9);
    graph.update(2, { caption: long.repeat(5) }); // Web が下へ伸びて、下の箱を押し下げる
    expect(at(graph, 9)[1]).toBeGreaterThan(below[1]!);
    graph.update(2, { caption: "トップ画面" });
    expect(at(graph, 9)).toEqual(below);
  });

  test("元の位置へ戻すときは今の x のまま上へ戻すだけで、横には動かさない", () => {
    // サンプルのフロントエンドは、開いたときにタイトルとわずかに重なって押し下げられ、元の位置を覚えている
    const { graph } = setup(sample());
    const at = (id: number) => [graph.info(id).x, graph.info(id).y];
    const front = at(3);
    graph.update(3, { childView: "hidden" }); // 上辺の中央を保って縮む（x が変わる）
    const hidden = at(3);
    graph.update(17, { childView: "nest" }); // 関係ない箱を変えて、全体を置き直す
    expect(at(3)).toEqual(hidden);
    graph.update(3, { childView: "nest" });
    expect(at(3)).toEqual(front);
  });

  test("押し下げられている箱の設定を自分で変えたら、その位置が本来いたい位置になり、上が空いても上がらない", () => {
    const { graph } = setup(data());
    graph.update(2, { caption: long.repeat(3) }); // カート画面を押し下げる
    const pushed = at(graph, 3);
    graph.update(3, { color: "#ef4444" }); // 押し下げられたカート画面の設定を変える
    graph.update(2, { caption: "トップ画面" });
    expect(at(graph, 3)).toEqual(pushed);
  });

  test("押し下げられたあとにドラッグした相手は、その位置のまま", () => {
    const { el, graph } = setup(data());
    graph.update(2, { caption: long });
    dragBy(el, graph, 3, 0, 20);
    const moved = at(graph, 3);
    graph.update(2, { caption: "トップ画面" });
    expect(at(graph, 3)).toEqual(moved);
  });
});

// 以前は、隣の手前まで狭めて折り返した（fitToRow）。設定変更では使わず、統一した決まりで押す（docs/PAPER-plan.md の 4.6。開いたとき・読み直しは段階 6 まで今のまま）
describe("文字の箱が育つと、同じ段の隣を同じ向きに押し、文字を戻せば元の位置へ戻る", () => {
  const LONG = "ユーザーあいうえおかきくけこさしすせそたちつてと".repeat(3);
  const rect = (graph: Graph, id: number) => { const i = graph.info(id); return [i.x, i.y, i.w, i.h]; };

  test("長い文字を入れると左上を保って広がり、右の大きい隣を右へ押す（下へはずらさない）。文字を戻せば元の大きさと位置", () => {
    const { graph } = setup(sample());
    const user = rect(graph, 2), front = rect(graph, 3);
    graph.update(2, { caption: LONG });
    const u = graph.info(2), f = graph.info(3);
    expect([u.x, u.y]).toEqual([user[0]!, user[1]!]);
    expect(u.w).toBeGreaterThan(user[2]!);
    expect(f.x).toBeGreaterThan(front[0]!); // フロントエンドは右へ
    expect(f.y).toBe(front[1]!);
    expect(f.x).toBeGreaterThanOrEqual(u.x + u.w + 8);
    graph.update(2, { caption: "ユーザー" });
    expect([rect(graph, 2), rect(graph, 3)]).toEqual([user, front]);
    graph.update(2, { caption: LONG });
    graph.update(2, { caption: "ユーザー" });
    expect(rect(graph, 2)).toEqual(user);
  });

  test("左の大きい隣とは重ならず、縮めば元の位置に戻る", () => {
    // 左上を保って右と下へ広がるので、左の大きい隣にはぶつからない
    const { graph } = setup({
      nodes: [{ id: 1, caption: "大きい相手", x: 40, y: 100, width: 250, fixedWidth: true, height: 200, fixedHeight: true }, { id: 2, caption: "箱", x: 300, y: 150 }],
    });
    const before = rect(graph, 2);
    graph.update(2, { caption: LONG });
    expect(graph.info(2).x).toBeGreaterThanOrEqual(40 + 250 + 8); // 左の大きい隣と重ならない
    graph.update(2, { caption: "箱" });
    expect(rect(graph, 2)).toEqual(before);
  });

  test("線でつながった大きい隣は、線の間隔（linkGap）を残して右へ押し、文字を戻すと両方とも元の位置に戻る", () => {
    const { graph } = setup({
      nodes: [{ id: 1, caption: "ユーザー", x: 200, y: 100 }, { id: 2, caption: "大きい相手", x: 350, y: 60, width: 400, fixedWidth: true, height: 200, fixedHeight: true }],
      edges: [[1, 2]],
    });
    const user = rect(graph, 1), big = rect(graph, 2);
    graph.update(1, { caption: LONG });
    const u = graph.info(1);
    expect([u.x, u.y]).toEqual([200, 100]);
    expect(graph.info(2).x).toBe(Math.max(350, u.x + u.w + PLAIN_GAPS.linkGap));
    graph.update(1, { caption: "ユーザー" });
    expect([rect(graph, 1), rect(graph, 2)]).toEqual([user, big]);
  });

  test("Undo・Redo（データからの作り直し）でも同じ幅になる", () => {
    const { graph } = setup(sample());
    graph.update(2, { caption: LONG });
    const after = rect(graph, 2), front = rect(graph, 3);
    graph.undo();
    graph.redo();
    expect([rect(graph, 2), rect(graph, 3)]).toEqual([after, front]);
  });

  test("ファイルには固定の印を書かない（width は今の大きさ。D44 の段階 3）", () => {
    const { graph } = setup(sample());
    graph.update(2, { caption: LONG });
    const n = graph.toJSON().nodes.find(n => n.id === 2)!;
    expect(["fixedWidth" in n, n.width]).toEqual([false, graph.info(2).w]);
  });
});
