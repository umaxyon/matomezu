// 本文（長文）を入れられる箱（docs/BODY-plan.md）のテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import type { BoxInfo, Diagram } from "../web/src/types";
import { problems } from "../web/src/validate";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const stage = document.createElement("div");
  const side = document.createElement("aside");
  document.body.append(side, stage);
  let panel: Panel | null = null;
  graph = createGraph(stage, data, { measureText: fakeMeasure, onSelect: i => panel?.show(i) });
  panel = createPanel(side, graph);
  const node = (id: number) => stage.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!;
  const bodyEl = (id: number) => node(id).querySelector<HTMLElement>(":scope > .mz-head > .mz-body")!;
  return { g: graph, side, node, bodyEl, info: (id: number) => graph!.info(id) as BoxInfo };
}

// 偽の測り方（test/helpers.ts の fakeMeasure）: 1 文字 9px、本文は 1 行 18px、本体の左右の余白 16px
test("本文はキャプションの下に出し、その分だけ箱が高くなる。幅はキャプションと本文の中身の広い方（サイズの最大幅まで）", () => {
  const { g, bodyEl, info } = setup({
    nodes: [
      { id: 1, caption: "見出し", x: 40, y: 40 },
      { id: 2, caption: "見出し", body: "一行目\n二行目\n三行目", x: 300, y: 40 },
      { id: 3, caption: "見出し", body: "あ".repeat(80), x: 40, y: 300 }, // 720px（M の最大幅 240 を超える）
    ],
  });
  expect(bodyEl(1).hidden).toBe(true);
  expect(bodyEl(2).hidden).toBe(false);
  expect(bodyEl(2).textContent).toBe("一行目\n二行目\n三行目");
  expect(info(1).h).toBe(64);               // 最小の高さ
  expect(info(2).h).toBe(18 + 8 + 54);      // キャプション 1 行と余白、本文 3 行
  expect(info(3).w).toBe(240);              // 最大幅を超えず
  expect(info(3).h).toBe(18 + 8 + 4 * 18);   // 本文は 224px で折り返して 4 行（縦に伸びる）
  expect(g.toJSON().nodes[1]!.body).toBe("一行目\n二行目\n三行目");
});

test("本文の幅（bodyWidth）は箱の幅の下限として効く。キャプションの方が広ければキャプションの幅、最大幅は超えない", () => {
  const { info } = setup({
    nodes: [
      { id: 1, caption: "短い", body: "本文", bodyWidth: 200, x: 40, y: 40 },
      { id: 2, caption: "とても長いキャプションです", body: "本文", bodyWidth: 130, x: 300, y: 40 },
      { id: 3, caption: "短い", body: "本文", bodyWidth: 900, x: 40, y: 300 },
    ],
  });
  expect(info(1).w).toBe(200);
  expect(info(2).w).toBeGreaterThan(130);
  expect(info(3).w).toBe(240);
});

test("S サイズ・ほかの形・切り詰める箱では本文を出さない。本文があれば、サイドバーで形と S を選べない", () => {
  const { g, bodyEl, side } = setup({
    nodes: [
      { id: 1, caption: "S", size: "S", body: "本文", x: 40, y: 40 },
      { id: 2, caption: "DB", shape: "db", body: "本文", x: 300, y: 40 },
      { id: 3, caption: "箱", body: "本文", x: 40, y: 300 },
    ],
  });
  expect(bodyEl(1).hidden).toBe(true);
  expect(bodyEl(2).hidden).toBe(true);
  g.select(3);
  const disabled = (name: string) => [...side.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].filter(i => i.disabled).map(i => i.value);
  expect(disabled("mzp-shape")).toEqual(["person", "db", "diamond"]);
  expect(disabled("mzp-size")).toEqual(["S"]);
});

test("子を内包する箱の本文は見出しの下に置き、子はその下に並ぶ", () => {
  const { info, bodyEl } = setup({
    nodes: [
      { id: 1, caption: "枠", body: "一行目\n二行目\n三行目", x: 40, y: 40 },
      { id: 2, parent: 1, caption: "子" },
    ],
  });
  expect(bodyEl(1).hidden).toBe(false);
  expect(bodyEl(1).style.position).toBe("absolute");
  // 見出し 30 + 本文 3 行（54）+ 間 6 より下に子がいる
  expect(info(2).y).toBeGreaterThanOrEqual(30 + 54 + 6);
});

test("リストの子の本文は、リストがそろえた幅に合わせる（親を優先）", () => {
  const { info } = setup({
    nodes: [
      { id: 1, caption: "リスト", childView: "list", x: 40, y: 40 },
      { id: 2, parent: 1, caption: "長い項目のキャプションですよ" },
      { id: 3, parent: 1, caption: "短", body: "本文", bodyWidth: 120 },
    ],
  });
  expect(info(3).w).toBe(info(2).w);
});

test("body は文字列、bodyWidth は正の数だけ", () => {
  expect(problems({ nodes: [{ id: 1, body: 3 as never }] })[0]).toContain("body は文字列");
  expect(problems({ nodes: [{ id: 1, bodyWidth: -5 }] })[0]).toContain("bodyWidth は正の数");
  expect(problems({ nodes: [{ id: 1, body: "本文", bodyWidth: 200 }] })).toEqual([]);
});

test("選んだ箱の本文の右の縁をドラッグすると本文の幅が変わり、右の箱を押しのける。狭めれば戻り、手を離すと 1 件の履歴になる", () => {
  const { g, node, info } = setup({
    nodes: [
      { id: 1, caption: "本文の箱", body: "本文", x: 40, y: 40 },
      { id: 2, caption: "右の箱", x: 200, y: 40 },
    ],
  });
  g.select(1);
  const grip = node(1).querySelector<HTMLElement>(":scope > .mz-head > .mz-body-grip")!;
  expect(grip.hidden).toBe(false);
  const w0 = info(1).w, at2 = [info(2).x, info(2).y];
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  const before = g.history().canUndo;
  fire("pointerdown", 0);
  fire("pointermove", 80);
  expect(info(1).w).toBe(w0 + 80);
  expect([info(2).x, info(2).y]).not.toEqual(at2); // 押しのけた（最上位は下へずらす）
  fire("pointermove", 0);
  expect([info(2).x, info(2).y]).toEqual(at2);     // 狭めれば戻る
  fire("pointermove", 60);
  fire("pointerup", 60);
  expect(g.toJSON().nodes[0]!.bodyWidth).toBe(w0 + 60);
  expect(before).toBe(false);
  g.undo();
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined();
  expect(info(1).w).toBe(w0);
});

test("本文の幅はサイズの最大幅で止まる", () => {
  const { g, node, info } = setup({ nodes: [{ id: 1, caption: "本文の箱", body: "本文", x: 40, y: 40 }] });
  g.select(1);
  const grip = node(1).querySelector<HTMLElement>(":scope > .mz-head > .mz-body-grip")!;
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", 900);
  fire("pointerup", 900);
  expect(info(1).w).toBe(240); // M の最大幅
  expect(g.toJSON().nodes[0]!.bodyWidth).toBe(240);
});
