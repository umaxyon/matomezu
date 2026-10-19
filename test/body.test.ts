// 本文（長文）を入れられる箱（docs/BODY-plan.md）のテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { openEditDialog } from "../web/src/edit-dialog";
import { mountDiagram } from "../web/src/view";
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
  document.body.append(stage);
  graph = createGraph(stage, data, { measureText: fakeMeasure });
  const node = (id: number) => stage.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!;
  const bodyEl = (id: number) => node(id).querySelector<HTMLElement>(":scope > .mz-head > .mz-body")!;
  return { g: graph, node, bodyEl, info: (id: number) => graph!.info(id) as BoxInfo };
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

test("本文の幅（bodyWidth）は本文を箱の中で狭めるだけで、箱の幅は変えない。狭めた分だけ本文が折り返して箱が高くなる（D45）", () => {
  const { info, node } = setup({
    nodes: [
      { id: 1, caption: "短い", body: "一\n二\n" + "あ".repeat(20), x: 40, y: 40 },                 // 本文 180px → 箱 196
      { id: 2, caption: "短い", body: "一\n二\n" + "あ".repeat(20), bodyWidth: 90, x: 300, y: 40 }, // 本文を 90px の列に
    ],
  });
  expect(info(2).w).toBe(info(1).w);
  expect(info(1).h).toBe(18 + 8 + 3 * 18);
  expect(info(2).h).toBe(18 + 8 + 4 * 18);
  const head = (id: number) => node(id).querySelector<HTMLElement>(":scope > .mz-head")!;
  expect(head(2).style.getPropertyValue("--mz-body-col")).toBe("90px");
  expect(head(1).style.getPropertyValue("--mz-body-col")).toBe("");
});

test("S サイズ・ほかの形・切り詰める箱では本文を出さない。本文があれば、編集ダイアログで形と S を選べない", () => {
  const { g, bodyEl } = setup({
    nodes: [
      { id: 1, caption: "S", size: "S", body: "本文", x: 40, y: 40 },
      { id: 2, caption: "DB", shape: "db", body: "本文", x: 300, y: 40 },
      { id: 3, caption: "箱", body: "本文", x: 40, y: 300 },
    ],
  });
  expect(bodyEl(1).hidden).toBe(true);
  expect(bodyEl(2).hidden).toBe(true);
  openEditDialog(g, "3");
  const dlg = document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  const disabled = (name: string) => [...dlg.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].filter(i => i.disabled).map(i => i.value);
  // 形は絵の並び（shape-picker.ts）。本文があるあいだは、ボックスのほかは選べない
  const shapes = [...dlg.querySelectorAll<HTMLInputElement>('input[name="shape"]')];
  expect(shapes.filter(i => !i.disabled).map(i => i.value)).toEqual(["box"]);
  expect(shapes.length).toBeGreaterThan(10);
  expect(disabled("size")).toEqual(["S"]);
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


test("選んだ箱の本文の右の縁をドラッグすると本文だけが狭まり、箱の幅は変わらない。下の箱を押しのけ、広げれば戻り、手を離すと 1 件の履歴になる（D45）", () => {
  const { g, node, info } = setup({
    nodes: [
      { id: 1, caption: "本文の箱", body: "あ".repeat(26), x: 40, y: 40 }, // 本文 234px → 箱 240（M の最大）。内側 224
      { id: 2, caption: "下の箱", x: 40, y: 120 },
    ],
  });
  g.select(1);
  const grip = node(1).querySelector<HTMLElement>(":scope > .mz-head > .mz-body-grip")!;
  expect(grip.hidden).toBe(true); // 内側の幅 224 は本文のつまみを出す 240 に足りない
  g.load({ nodes: [{ id: 1, caption: "本文の箱", size: "L", body: "一\n二\n" + "あ".repeat(30), x: 40, y: 40 }, { id: 2, caption: "下の箱", x: 40, y: 120 }] });
  g.select(1);
  const grip2 = node(1).querySelector<HTMLElement>(":scope > .mz-head > .mz-body-grip")!;
  expect(grip2.hidden).toBe(false); // 本文 270px → 箱 286。内側 270
  const w0 = info(1).w, h0 = info(1).h, at2 = [info(2).x, info(2).y];
  const fire = (type: string, x: number) => grip2.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  const before = g.history().canUndo;
  fire("pointerdown", 0);
  fire("pointermove", -100); // 本文の列 170
  expect(info(1).w).toBe(w0);
  expect(info(1).h).toBeGreaterThan(h0);
  expect(info(2).y).toBeGreaterThan(at2[1]!); // 高くなった分、下の箱を押す
  fire("pointermove", 0);
  expect([info(2).x, info(2).y]).toEqual(at2); // 広げれば戻る
  fire("pointermove", -400);
  fire("pointerup", -400);
  expect(g.toJSON().nodes[0]!.bodyWidth).toBe(160); // 本文の最小の幅で止まる
  expect(info(1).w).toBe(w0);
  expect(before).toBe(false);
  g.undo();
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined();
});

test("本文のつまみは箱の内側の幅まで。そこまで広げたら自動に戻す（D45）", () => {
  const { g, node, info } = setup({ nodes: [{ id: 1, caption: "本文の箱", size: "L", body: "あ".repeat(30), bodyWidth: 200, x: 40, y: 40 }] });
  g.select(1);
  const w0 = info(1).w;
  const grip = node(1).querySelector<HTMLElement>(":scope > .mz-head > .mz-body-grip")!;
  const fire = (type: string, x: number) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", 900);
  fire("pointerup", 900);
  expect(info(1).w).toBe(w0);
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined();
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
  const { g, info } = setup({ nodes: [{ id: 1, caption: "見出し", body: "一\n二\n三\n四\n五", x: 40, y: 40 }] });
  openEditDialog(g, "1");
  const select = document.querySelector<HTMLSelectElement>('.mz-dlg-overlay [name="lines"]')!;
  expect(select.value).toBe("");
  expect(select.options[0]!.textContent).toBe("制限なし");
  select.value = "3";
  document.querySelector<HTMLElement>(".mz-dlg-overlay [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyLines).toBe(3);
  expect(info(1).h).toBe(18 + 8 + 3 * 18);
  // 制限なしに戻す
  openEditDialog(g, "1");
  const again = document.querySelector<HTMLSelectElement>('.mz-dlg-overlay [name="lines"]')!;
  expect(again.value).toBe("3");
  again.value = "";
  document.querySelector<HTMLElement>(".mz-dlg-overlay [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyLines).toBeUndefined();
});


test("子の見せ方をリストにすると、子を持つ子は孫を描かずに縮図の行になり、本文は本体の中の流れに置く（D13）。内包に戻せば枠と見出しの下", () => {
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
  expect(head(2).classList.contains("mz-group")).toBe(false);
  expect(head(2).classList.contains("mz-link-row")).toBe(true);
  expect(node(3).style.display).toBe("none");
  expect(bodyEl(2).style.position).toBe(""); // 本体の中の流れに置く
  g.update(1, { childView: "nest" });
  expect(head(2).classList.contains("mz-group")).toBe(true);
  expect(node(3).style.display).toBe("");
  expect(bodyEl(2).style.position).toBe("absolute");
});

test("編集ダイアログの「箱の幅に合わせる」で、つまみで変えた本文の幅を消す（確定したときに書く）。内包する箱でも押せる", () => {
  const { g, info } = setup({ nodes: [{ id: 1, caption: "見出し", body: "一\n二\n" + "あ".repeat(20), bodyWidth: 100, x: 40, y: 40 }] });
  const h0 = info(1).h;
  const open = () => openEditDialog(g, "1");
  open();
  const dlg = () => document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  expect(dlg().querySelector("[data-width-auto]")!.textContent).toBe("箱の幅に合わせる");
  dlg().querySelector<HTMLElement>("[data-width-auto]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyWidth).toBe(100); // まだ書かない
  dlg().querySelector<HTMLElement>("[data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined();
  expect(info(1).h).toBeLessThan(h0); // 本文が箱の幅いっぱいに戻って低くなる
  // 自動のときは押せない
  open();
  expect(dlg().querySelector<HTMLButtonElement>("[data-width-auto]")!.disabled).toBe(true);
  dlg().querySelector<HTMLElement>("[data-cancel]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // 内包する箱では「箱の幅に合わせる」
  g.load({ nodes: [{ id: 1, caption: "枠", body: "本文", bodyWidth: 170, x: 40, y: 40 }, { id: 2, parent: 1, caption: "子", x: 200, y: 30 }] });
  g.select(1);
  open();
  expect(dlg().querySelector<HTMLButtonElement>("[data-width-auto]")!.disabled).toBe(false);
});

// ---- 箱のサイズと幅の決まり（docs/SIZE-plan.md）----

test("本文を持つ箱にも最小の幅 160 は無い（D45 で廃止）。子の無い箱は中身の幅、子を持つ箱は子の並びの幅", () => {
  const { info } = setup({
    nodes: [
      { id: 1, caption: "あ", x: 40, y: 40 },
      { id: 2, caption: "あ", body: "本", x: 300, y: 40 },
      { id: 3, caption: "枠", body: "本", x: 40, y: 300 },
      { id: 4, parent: 3, caption: "子", x: 12, y: 60 }, // 子の並びだけなら 12 + 120 + 12 = 144
    ],
  });
  expect(info(1).w).toBe(120);
  expect(info(2).w).toBe(120);
  expect(info(3).w).toBe(144);
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

test("サイズは見た目が葉の箱だけに効く。内包する箱は S でも本文を持て、ツリーの根の本体は S なら持てない", () => {
  const nest = setup({
    nodes: [{ id: 1, caption: "枠", size: "S", body: "本文", x: 40, y: 40 }, { id: 2, parent: 1, caption: "子" }],
  });
  expect(nest.bodyEl(1).hidden).toBe(false);
  const tree = setup({
    world: { childView: "tree", root: 3 },
    nodes: [{ id: 3, caption: "木", size: "S", body: "本文", x: 400, y: 40 }, { id: 4, parent: 3, caption: "子" }],
  });
  expect(tree.bodyEl(3).hidden).toBe(true);
});

test("previewSide は right / left / none だけ（D13）", () => {
  expect(problems({ nodes: [{ id: 1, childView: "list", previewSide: "top" }] })[0]).toContain("previewSide");
  expect(problems({ nodes: [{ id: 1, childView: "list", previewSide: "left" }] })).toEqual([]);
});

test("本文の幅のつまみをダブルクリックすると、本文の幅を自動に戻す（編集ダイアログは開かない）", () => {
  const stage = document.createElement("div"), side = document.createElement("div");
  document.body.append(stage, side);
  const g = graph = mountDiagram(stage, side, { nodes: [{ id: 1, caption: "見出し", size: "L", bodyWidth: 170, body: "一\n二\n" + "あ".repeat(30), x: 40, y: 40 }] }, { measureText: fakeMeasure }).graph;
  const h0 = g.info(1).h;
  g.select(1);
  stage.querySelector('.mz-node[data-id="1"] > .mz-head > .mz-body-grip')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.bodyWidth).toBeUndefined();
  expect(g.info(1).h).toBeLessThan(h0);
  expect(document.querySelector(".mz-dlg-overlay")).toBeNull();
});
