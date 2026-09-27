// 配置の動きを固定するテスト。配置の処理を整理するときに、動きが変わっていないことを確かめる
import { afterEach, describe, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram, Patch } from "../web/src/types";
import { type R, dragBy, example, fakeMeasure, frames, rectOf } from "./helpers";

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

const sample = () => example("three-levels");

const apart = (a: R, b: R) =>
  a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;

// 崩れてはいけない性質を確かめ、見つかった問題を返す
function violations(el: HTMLElement): string[] {
  const out: string[] = [];
  const containers = [el.querySelector(".mz-world") as HTMLElement,
    ...[...el.querySelectorAll<HTMLElement>(".mz-node")].filter(n =>
      n.querySelector(":scope > .mz-head")!.classList.contains("mz-group"))];
  for (const c of containers) {
    const kids = [...c.querySelectorAll<HTMLElement>(":scope > .mz-node")]
      .filter(n => n.style.display !== "none" && !n.classList.contains("mz-ghost"));
    const rects = kids.map(rectOf);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (!apart(rects[i]!, rects[j]!)) out.push(`重なり: ${kids[i]!.textContent} / ${kids[j]!.textContent}`);
    }
    if (c.classList.contains("mz-world")) continue;
    const p = rectOf(c);
    for (const [i, r] of rects.entries()) {
      // 内包の子は、余白（左右下 12、上は見出し 30）の内側に収まる
      if (r.x < 11.5 || r.y < 29.5 || r.x + r.w > p.w - 11.5 || r.y + r.h > p.h - 11.5) {
        out.push(`はみ出し: ${kids[i]!.textContent}`);
      }
    }
  }
  return out;
}

// 決まった種の乱数（毎回同じ操作になる）
function random(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ランダムな操作を1つ行い、何をしたかを返す
function randomOp(el: HTMLElement, g: Graph, rnd: () => number): string {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const ids = g.toJSON().nodes.map(n => n.id!);
  const id = pick(ids);
  const op = pick(["view", "dir", "size", "shape", "caption", "fit", "reparent", "drag", "undo"] as const);
  const patches: Record<string, () => Patch> = {
    view: () => ({ childView: pick(["nest", "tree", "hidden"] as const) }),
    dir: () => ({ treeDirection: pick(["down", "up", "left", "right"] as const) }),
    size: () => ({ size: pick(["L", "M", "S"] as const) }),
    shape: () => ({ shape: pick(["box", "person", "db"] as const) }),
    caption: () => ({ caption: pick(["短", "少し長いキャプション", "とても長いキャプションが入ったボックスの例"]) }),
  };
  if (patches[op]) {
    const p = patches[op]!();
    g.update(id, p);
    return `${op} ${id} ${JSON.stringify(p)}`;
  }
  if (op === "fit") {
    const w = pick(["width", "height", "both"] as const);
    g.fitChildren(id, w);
    return `fit ${id} ${w}`;
  }
  if (op === "reparent") {
    const to = pick([null, ...ids]);
    try { g.reparent(id, to); } catch { /* 自分や子孫の中へは移せない */ }
    return `reparent ${id} → ${to}`;
  }
  if (op === "undo") {
    g.undo();
    return "undo";
  }
  g.select(id);
  const head = el.querySelector(".mz-node.mz-current > .mz-head");
  const dx = Math.round((rnd() - 0.5) * 400), dy = Math.round((rnd() - 0.5) * 400);
  if (head) {
    const fire = (type: string, x: number, y: number) =>
      head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    fire("pointerdown", 0, 0);
    for (let i = 1; i <= 8; i++) fire("pointermove", (dx * i) / 8, (dy * i) / 8);
    fire("pointerup", dx, dy);
  }
  return `drag ${id} ${dx},${dy}`;
}

describe("ランダムな操作でも崩れない", () => {
  test.each([1, 2, 3])("種 %i", seed => {
    const rnd = random(seed * 7919);
    const { el, graph } = setup(sample());
    const log: string[] = [];
    for (let step = 0; step < 150; step++) {
      log.push(randomOp(el, graph, rnd));
      const v = violations(el);
      if (v.length) throw new Error(`${log.slice(-3).join(" / ")}: ${v.join(", ")}`);
      // Undo して Redo すれば、同じ状態に戻る
      if (graph.history().canUndo) {
        const before = JSON.stringify(graph.toJSON());
        graph.undo();
        graph.redo();
        expect(JSON.stringify(graph.toJSON())).toBe(before);
      }
    }
  }, 60000);
});

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

describe("大きさや見せ方が変わっても、グループの中は左上、最上位は上辺の中央を保つ", () => {
  // 線は、真横や真下の相手とは水平・垂直のまま保たれる（graph.test.ts の「線のつなぎ方」）
  test("最上位は上辺の中央を保つ。見せ方を何度切り替えても元に戻り、上の相手も押し下げない", () => {
    const { graph } = setup(sample());
    const at = (id: number) => [graph.info(id).x, graph.info(id).y];
    const center = () => graph.info(3).x + graph.info(3).w / 2;
    const title = at(1), front = at(3), user = at(2), back = at(10), c0 = center();
    for (const v of ["tree", "nest", "hidden", "tree", "nest", "hidden", "nest"] as const) {
      graph.update(3, { childView: v });
      expect(graph.info(3).y).toBe(front[1]!); // 上辺は動かない
      expect(Math.abs(center() - c0)).toBeLessThanOrEqual(1); // 横の中心も動かない（非表示でも左に寄らない）
      expect([at(1), at(2)]).toEqual([title, user]);
    }
    expect(at(3)).toEqual(front);
    expect(at(10)).toEqual(back); // ツリーのときに押し下げたバックエンドも戻る
  });

  test("ツリーと内包を切り替えても、外枠の上辺と横の中心を保つ", () => {
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "ユーザー", x: 40, y: 300 },
        { id: 2, caption: "フロントエンド", childView: "tree", x: 400, y: 260 },
        { id: 3, caption: "とても長い名前のグループ", parent: 2 }, { id: 4, caption: "モバイル", parent: 2 },
      ],
      edges: [[1, 2]],
    });
    const top = () => { const i = graph.info(2); return [i.x + i.w / 2, i.y]; };
    const before = top();
    graph.update(2, { childView: "nest" });
    expect(Math.abs(top()[0]! - before[0]!)).toBeLessThanOrEqual(1);
    expect(top()[1]).toBe(before[1]);
    graph.update(2, { childView: "tree" });
    expect(graph.info(2).x).toBe(400); // 往復すれば元どおり
  });

  test("入れ子の中で内包からツリーにしても、下の相手との間で上に余白を作らない", () => {
    // データ枠の中で、DB（API を内包）の右下にキャッシュがつながっている
    const { graph } = setup({
      nodes: [
        { id: 1, caption: "データ", x: 40, y: 40 },
        { id: 2, caption: "DB", parent: 1, x: 12, y: 36 },
        { id: 3, caption: "API", parent: 2, childView: "tree", x: 12, y: 36 },
        { id: 4, caption: "認証", parent: 3, size: "S" }, { id: 5, caption: "注文", parent: 3, size: "S" },
        { id: 6, caption: "キャッシュ", parent: 1, x: 150, y: 330 },
      ],
      edges: [[2, 6]],
    } as Diagram);
    const before = graph.info(2);
    graph.update(2, { childView: "tree" });
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

  test("文字を長くして押し下げた兄弟は、文字を戻すと元の位置へ戻り、親も元の大きさに戻る", () => {
    const { graph } = setup(data());
    const cart = at(graph, 3), web = graph.info(1);
    graph.update(2, { caption: long });
    expect(at(graph, 3)[1]).toBeGreaterThan(cart[1]!); // 押し下げられる
    graph.update(2, { caption: "トップ画面" });
    expect(at(graph, 3)).toEqual(cart);
    expect([graph.info(1).w, graph.info(1).h]).toEqual([web.w, web.h]);
  });

  test("縮んでも元の位置が空かなければ、空いたところまで上がる", () => {
    const { graph } = setup(data());
    graph.update(2, { caption: long.repeat(8) }); // 高く伸びて大きく押し下げる
    const pushed = at(graph, 3)[1]!;
    graph.update(2, { caption: long.repeat(5) }); // 少し低くなる（まだ元の位置とは重なる）
    const y = at(graph, 3)[1]!;
    expect(y).toBeLessThan(pushed);
    expect(y).toBeGreaterThan(30);
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

  test("押し下げられたあとにドラッグした相手は、その位置のまま", () => {
    const { el, graph } = setup(data());
    graph.update(2, { caption: long });
    dragBy(el, graph, 3, 0, 20);
    const moved = at(graph, 3);
    graph.update(2, { caption: "トップ画面" });
    expect(at(graph, 3)).toEqual(moved);
  });
});

describe("文字の箱は、同じ段の兄弟にはみ出すなら空いている幅まで狭めて折り返す", () => {
  const LONG = "ユーザーあいうえおかきくけこさしすせそたちつてと".repeat(3);
  const rect = (graph: Graph, id: number) => { const i = graph.info(id); return [i.x, i.y, i.w, i.h]; };

  test("長い文字を入れても右の大きい隣へ飛ばず、左に残って折り返す。文字を戻せば元の大きさと位置", () => {
    const { graph } = setup(sample());
    const user = rect(graph, 2), front = graph.info(3);
    graph.update(2, { caption: LONG });
    const u = graph.info(2);
    expect(u.x + u.w).toBeLessThanOrEqual(front.x - 8); // フロントエンドの手前まで
    expect(u.y).toBe(user[1]!);
    expect(u.h).toBeGreaterThan(user[3]!); // 折り返して高くなる
    expect([front.x, front.y]).toEqual([graph.info(3).x, graph.info(3).y]); // フロントエンドは動かない
    graph.update(2, { caption: "ユーザー" });
    // ユーザーはワールドの左端の近くにいるので、広がったときに左端で寄せた分だけ中心がずれる（最初の1回だけ）
    const back = rect(graph, 2);
    expect(back.slice(1)).toEqual(user.slice(1));
    graph.update(2, { caption: LONG });
    graph.update(2, { caption: "ユーザー" });
    expect(rect(graph, 2)).toEqual(back); // 繰り返しても、ずれは積み重ならない
  });

  test("左に空きがあれば、中心を保って狭めるので、文字を戻すと元の位置に戻る", () => {
    const { graph } = setup({
      nodes: [{ id: 1, caption: "ユーザー", x: 200, y: 100 }, { id: 2, caption: "大きい相手", x: 350, y: 60, width: 400, height: 200 }],
      edges: [[1, 2]],
    });
    const user = rect(graph, 1);
    graph.update(1, { caption: LONG });
    const u = graph.info(1);
    expect(u.x + u.w).toBe(350 - 8);
    expect(u.x + u.w / 2).toBeCloseTo(260, 0); // 中心 (200 + 60) を保つ
    graph.update(1, { caption: "ユーザー" });
    expect(rect(graph, 1)).toEqual(user);
  });

  test("ワールドの左端にも、グループと同じ余白（12）を残す", () => {
    const { graph } = setup(sample());
    graph.update(2, { caption: LONG });
    expect(graph.info(2).x).toBe(12);
    expect(graph.info(2).x + graph.info(2).w).toBe(graph.info(3).x - 8);
  });

  test("Undo・Redo（データからの作り直し）でも同じ幅になる", () => {
    const { graph } = setup(sample());
    graph.update(2, { caption: LONG });
    const after = rect(graph, 2), front = rect(graph, 3);
    graph.undo();
    graph.redo();
    expect([rect(graph, 2), rect(graph, 3)]).toEqual([after, front]);
  });

  test("ファイルには幅を書かない", () => {
    const { graph } = setup(sample());
    graph.update(2, { caption: LONG });
    expect("width" in graph.toJSON().nodes.find(n => n.id === 2)!).toBe(false);
  });
});
