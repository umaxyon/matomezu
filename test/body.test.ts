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
      { id: 1, caption: "本文の箱", body: "本文", x: 40, y: 40 }, // 本文の最小の幅 160（40〜200）
      { id: 2, caption: "右の箱", x: 240, y: 40 },
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

test("内包する箱の本文は箱の幅いっぱいで折り返す。子の並びで箱が広ければ、本文も広がって低くなり、子はその分上に来る", () => {
  const { info, bodyEl } = setup({
    nodes: [
      { id: 1, caption: "枠", body: "あ".repeat(40), x: 40, y: 40 },        // 360px
      { id: 2, parent: 1, caption: "とても長いキャプションの子です", x: 12, y: 30 },
      { id: 3, parent: 1, caption: "とても長いキャプションの子です", x: 300, y: 30 },
    ],
  });
  const w = info(1).w;
  expect(w).toBeGreaterThan(400);
  expect(bodyEl(1).style.width).toBe(`${w - 24}px`);
  // 本文は 1 行（18px）に収まるので、子は見出し 30 + 18 + 間 6 の高さ
  expect(info(2).y).toBe(30 + 18 + 6);
});

test("本文の最大行数（bodyLines）を超えた分は切り、箱はその行数の高さになる。全文はポインタを乗せると出る", () => {
  const { info, bodyEl } = setup({
    nodes: [
      { id: 1, caption: "見出し", body: "一\n二\n三\n四\n五", x: 40, y: 40 },
      { id: 2, caption: "見出し", body: "一\n二\n三\n四\n五", bodyLines: 2, x: 300, y: 40 },
    ],
  });
  expect(info(1).h).toBe(18 + 8 + 5 * 18);
  expect(info(2).h).toBe(Math.max(64, 18 + 8 + 2 * 18));
  expect(bodyEl(2).classList.contains("mz-body-clamp")).toBe(true);
  expect(bodyEl(2).title).toBe("一\n二\n三\n四\n五");
  expect(bodyEl(1).title).toBe("");
});

test("編集ダイアログで最大行数を選べる（制限なしを含む）", () => {
  const { g, side, info } = setup({ nodes: [{ id: 1, caption: "見出し", body: "一\n二\n三\n四\n五", x: 40, y: 40 }] });
  g.select(1);
  side.querySelector<HTMLElement>("[data-edit-box]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const select = document.querySelector<HTMLSelectElement>('.mz-dlg-overlay [name="lines"]')!;
  expect(select.value).toBe("");
  expect(select.options[0]!.textContent).toBe("制限なし");
  select.value = "3";
  document.querySelector<HTMLElement>(".mz-dlg-overlay [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyLines).toBe(3);
  expect(info(1).h).toBe(18 + 8 + 3 * 18);
  // 制限なしに戻す
  side.querySelector<HTMLElement>("[data-edit-box]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const again = document.querySelector<HTMLSelectElement>('.mz-dlg-overlay [name="lines"]')!;
  expect(again.value).toBe("3");
  again.value = "";
  document.querySelector<HTMLElement>(".mz-dlg-overlay [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyLines).toBeUndefined();
});

test("bodyLines は 1 以上の整数だけ", () => {
  expect(problems({ nodes: [{ id: 1, bodyLines: 0 }] })[0]).toContain("bodyLines は 1 以上の整数");
  expect(problems({ nodes: [{ id: 1, bodyLines: 2.5 }] })[0]).toContain("bodyLines は 1 以上の整数");
  expect(problems({ nodes: [{ id: 1, bodyLines: 3 }] })).toEqual([]);
});

test("子の見せ方をリストにしても、子を持つ子は枠のまま孫を出し、本文は見出しの下。非表示にすると文字の箱になり本文も箱に入る", () => {
  const { g, node, bodyEl } = setup({
    nodes: [
      { id: 1, caption: "根", x: 40, y: 40 },
      { id: 2, parent: 1, caption: "子", body: "子の本文" },
      { id: 3, parent: 2, caption: "孫" },
    ],
  });
  const head = (id: number) => node(id).querySelector<HTMLElement>(":scope > .mz-head")!;
  expect(head(2).classList.contains("mz-group")).toBe(true);
  g.update(1, { childView: "list" });
  expect(head(2).classList.contains("mz-group")).toBe(true);
  expect(node(3).style.display).toBe("");
  expect(bodyEl(2).style.position).toBe("absolute"); // 見出しの下
  g.update(2, { childView: "hidden" });
  expect(head(2).classList.contains("mz-group")).toBe(false);
  expect(node(3).style.display).toBe("none");
  expect(bodyEl(2).style.position).toBe(""); // 本体の中の流れに置く
  g.update(2, { childView: "nest" });
  g.update(1, { childView: "nest" });
  expect(head(2).classList.contains("mz-group")).toBe(true);
  expect(bodyEl(2).style.position).toBe("absolute");
});

test("編集ダイアログの「中身に合わせる」で、つまみで変えた本文の幅を消す（確定したときに書く）。内包する箱では「箱の幅に合わせる」", () => {
  const { g, side, info } = setup({ nodes: [{ id: 1, caption: "見出し", body: "本文", bodyWidth: 220, x: 40, y: 40 }] });
  expect(info(1).w).toBe(220);
  g.select(1);
  const open = () => side.querySelector<HTMLElement>("[data-edit-box]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  open();
  const dlg = () => document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  expect(dlg().querySelector("[data-width-auto]")!.textContent).toBe("中身に合わせる");
  dlg().querySelector<HTMLElement>("[data-width-auto]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyWidth).toBe(220); // まだ書かない
  dlg().querySelector<HTMLElement>("[data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined();
  expect(info(1).w).toBeLessThan(220);
  // 自動のときは押せない
  open();
  expect(dlg().querySelector<HTMLButtonElement>("[data-width-auto]")!.disabled).toBe(true);
  dlg().querySelector<HTMLElement>("[data-cancel]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // 内包する箱では「箱の幅に合わせる」
  g.load({ nodes: [{ id: 1, caption: "枠", body: "本文", bodyWidth: 170, x: 40, y: 40 }, { id: 2, parent: 1, caption: "子", x: 200, y: 30 }] });
  g.select(1);
  open();
  expect(dlg().querySelector("[data-width-auto]")!.textContent).toBe("箱の幅に合わせる");
  expect(dlg().querySelector<HTMLButtonElement>("[data-width-auto]")!.disabled).toBe(false);
});

// ---- 箱のサイズと幅の決まり（docs/SIZE-plan.md）----

test("本文を持つ箱は最小の幅 160。子を持つ箱でも、子が細ければ 160 まで広がる", () => {
  const { info } = setup({
    nodes: [
      { id: 1, caption: "あ", x: 40, y: 40 },
      { id: 2, caption: "あ", body: "本", x: 300, y: 40 },
      { id: 3, caption: "枠", body: "本", x: 40, y: 300 },
      { id: 4, parent: 3, caption: "子", x: 12, y: 60 }, // 子の並びだけなら 12 + 120 + 12 = 144
    ],
  });
  expect(info(1).w).toBe(120);
  expect(info(2).w).toBe(160);
  expect(info(3).w).toBe(160);
});

test("内包する箱の本文は箱を広げない。本文の幅を指定していても箱の幅は子の並びで決まり、指定が狭ければその幅で折り返す", () => {
  const nodes = (bodyWidth?: number) => [
    { id: 1, caption: "枠", body: "あ".repeat(80), x: 40, y: 40, ...(bodyWidth ? { bodyWidth } : {}) },
    { id: 2, parent: 1, caption: "子", x: 12, y: 30 },
    { id: 3, parent: 1, caption: "子", x: 200, y: 30 }, // 子の並びで 200 + 120 + 12 = 332
  ];
  const auto = setup({ nodes: nodes() });
  expect(auto.info(1).w).toBe(332);
  expect(auto.bodyEl(1).style.width).toBe(`${332 - 24}px`); // 自動は箱の幅いっぱい
  graph?.destroy();
  const wide = setup({ nodes: nodes(900) });
  expect(wide.info(1).w).toBe(332);                          // 広い指定でも箱は広がらない
  expect(wide.bodyEl(1).style.width).toBe(`${332 - 24}px`);  // 箱の幅で折り返す
  expect(wide.g.toJSON().nodes[0]!.bodyWidth).toBe(900);     // 覚えた幅は消さない
  graph?.destroy();
  const narrow = setup({ nodes: nodes(200) });
  expect(narrow.info(1).w).toBe(332);
  expect(narrow.bodyEl(1).style.width).toBe(`${200 - 24}px`); // 狭い指定はその幅で折り返す（本文の右が空く）
});

test("内包する箱の本文のつまみは、本文の最小の幅〜子の並びで決まった箱の幅。箱の幅まで広げたら自動に戻す", () => {
  const { g, node, info, bodyEl } = setup({
    nodes: [
      { id: 1, caption: "枠", body: "本文", x: 40, y: 40 },
      { id: 2, parent: 1, caption: "子", x: 12, y: 30 },
      { id: 3, parent: 1, caption: "子", x: 200, y: 30 },
    ],
  });
  g.select(1);
  const grip = node(1).querySelector<HTMLElement>(":scope > .mz-head > .mz-body-grip")!;
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", -100);
  expect(info(1).w).toBe(332);                    // 箱は変わらない
  expect(bodyEl(1).style.width).toBe(`${232 - 24}px`);
  fire("pointermove", -400);
  expect(bodyEl(1).style.width).toBe(`${160 - 24}px`); // 最小の幅で止まる
  fire("pointerup", -400);
  expect(g.toJSON().nodes[0]!.bodyWidth).toBe(160);
  fire("pointerdown", 0);
  fire("pointermove", 900);
  fire("pointerup", 900);
  expect(info(1).w).toBe(332);                    // 図を超えて広げられない
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined(); // 箱の幅まで広げたら自動
});

test("サイズは見た目が葉の箱だけに効く。内包する箱は S でも本文を持て、ツリーの親の本体は S なら持てない", () => {
  const { bodyEl } = setup({
    nodes: [
      { id: 1, caption: "枠", size: "S", body: "本文", x: 40, y: 40 },
      { id: 2, parent: 1, caption: "子" },
      { id: 3, caption: "木", size: "S", body: "本文", childView: "tree", x: 400, y: 40 },
      { id: 4, parent: 3, caption: "子" },
    ],
  });
  expect(bodyEl(1).hidden).toBe(false);
  expect(bodyEl(3).hidden).toBe(true);
});
