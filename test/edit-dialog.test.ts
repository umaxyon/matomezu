// 編集ダイアログ（edit-dialog.ts）のテスト。D26 でサイドバーの情報の欄から移した項目（子の見せ方・見た目・子のサイズをそろえる）も含む
import { afterEach, expect, test } from "bun:test";
import { openBookDialog } from "../web/src/book-dialog";
import { closeEditDialog, openEditDialog } from "../web/src/edit-dialog";
import { noticeOf } from "../web/src/notices";
import { createGraph, type Graph } from "../web/src/graph";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";
import { SHAPE_GROUPS, SHAPE_LABELS, SHAPES } from "../web/src/validate";
import { shapeIcon } from "../web/src/shape-icons";

let graph: Graph | null = null;
afterEach(() => {
  closeEditDialog();
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const stage = document.createElement("div");
  document.body.append(stage);
  const notices: string[] = [];
  graph = createGraph(stage, data, { measureText: fakeMeasure, onEvent: ev => notices.push(noticeOf(ev)) });
  const dlg = <T extends Element>(sel: string) => document.querySelector<T>(`.mz-dlg-overlay ${sel}`);
  const dlgClick = (sel: string) => dlg<HTMLElement>(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const openDlg = (id: number) => openEditDialog(graph!, String(id));
  const ok = () => dlgClick("[data-ok]");
  const cancel = () => dlgClick("[data-cancel]");
  return { g: graph, notices, dlg, dlgClick, openDlg, ok, cancel };
}

const box = (g: Graph, id: number) => g.info(id) as BoxInfo;

test("キャプションと色を変える（色はボタンから開くポップアップの値の欄で）", () => {
  const { g, dlg, dlgClick, openDlg, ok } = setup({ nodes: [{ id: 1, caption: "API" }] });
  openDlg(1);
  dlg<HTMLInputElement>('[name="caption"]')!.value = "API ゲートウェイ";
  dlgClick("[data-color-open]");
  const value = document.querySelector<HTMLInputElement>(".mz-cp-value")!;
  value.value = "#3b82f6";
  value.dispatchEvent(new Event("change", { bubbles: true }));
  ok();
  expect([box(g, 1).caption, box(g, 1).color]).toEqual(["API ゲートウェイ", "#3b82f6"]);
});

test("キャプションと本文と仕切りの線を 1 件の変更として書く。Esc なら書かずに閉じる", () => {
  const { g, openDlg } = setup({ nodes: [{ id: 1, caption: "API" }] });
  openDlg(1);
  const dlg = () => document.querySelector<HTMLElement>(".mz-dlg-overlay");
  const field = <T extends HTMLElement>(name: string) => dlg()!.querySelector<T>(`[name="${name}"]`)!;
  expect(field<HTMLInputElement>("caption").value).toBe("API");
  field<HTMLInputElement>("caption").value = "書きかけ";
  field<HTMLInputElement>("caption").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(dlg()).toBeNull();
  expect(box(g, 1).caption).toBe("API");
  // 開き直して、本文と仕切りの線も変えて確定する（Ctrl+Enter）
  openDlg(1);
  field<HTMLInputElement>("caption").value = "API サーバー";
  // 本文が空のあいだ、区切り線は切って押せない。書き始めると押せるようになって入る
  expect([field<HTMLButtonElement>("rule").disabled, document.querySelector(".mz-dlg-onoff")!.textContent]).toEqual([true, "OFF"]);
  field<HTMLTextAreaElement>("body").value = "一行目\n二行目";
  field<HTMLTextAreaElement>("body").dispatchEvent(new Event("input", { bubbles: true }));
  expect([field<HTMLButtonElement>("rule").disabled, document.querySelector(".mz-dlg-onoff")!.textContent]).toEqual([false, "ON"]);
  field<HTMLElement>("rule").click(); // 区切り線を切る
  expect([field<HTMLElement>("rule").getAttribute("aria-checked"), document.querySelector(".mz-dlg-onoff")!.textContent]).toEqual(["false", "OFF"]);
  const before = g.history().canUndo;
  field<HTMLTextAreaElement>("body").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  expect(dlg()).toBeNull();
  expect(g.toJSON().nodes[0]).toMatchObject({ caption: "API サーバー", body: "一行目\n二行目", bodyRule: false });
  expect(before).toBe(false);
  g.undo(); // 1 件の変更なので、1 回で全部戻る
  const n = g.toJSON().nodes[0]!;
  expect([n.caption, n.body, n.bodyRule]).toEqual(["API", undefined, undefined]);
});

test("本文を出せない箱（S・ほかの形）では、本文の欄を使えない", () => {
  const { openDlg } = setup({ nodes: [{ id: 1, caption: "S", size: "S" }] });
  openDlg(1);
  const dlg = document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  expect(dlg.querySelector<HTMLTextAreaElement>('[name="body"]')!.disabled).toBe(true);
  expect(dlg.textContent).toContain("本文は、形がボックスで S 以外のサイズ、キャプションを 1 行にしていないときに出せます");
});

test("色の見本と「なし」、塗りつぶし・枠線（どれも確定のときに書く）", () => {
  const { g, dlg, openDlg, dlgClick, ok } = setup({ nodes: [{ id: 1 }] });
  expect(box(g, 1).color).toBe(""); // 色を書いていない
  const pickIn = (sel: string) => document.querySelector<HTMLElement>(`.mz-cp ${sel}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  openDlg(1);
  dlgClick("[data-color-open]");
  pickIn('[data-name="success"]');
  ok();
  expect(box(g, 1).color).toBe("success");
  openDlg(1);
  dlgClick("[data-color-open]");
  pickIn("[data-none]");
  dlg<HTMLInputElement>('[name="fill"]')!.checked = false;
  dlg<HTMLInputElement>('[name="border"]')!.checked = true;
  ok();
  expect([box(g, 1).color, box(g, 1).fill, box(g, 1).border]).toEqual(["", false, true]);
});

test("形と子の見せ方は編集ダイアログ、ツリーの向きはブックのダイアログのページのタブで選ぶ", () => {
  const { g, dlg, openDlg, ok, cancel } = setup({ nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3 }] });
  openDlg(3);
  dlg<HTMLInputElement>('input[name="shape"][value="db"]')!.checked = true; // 形は絵の並び（shape-picker.ts）
  expect(dlg('input[name="view"]')).toBeNull(); // 子の無い箱には子の見せ方を出さない
  ok();
  expect(box(g, 3).shape).toBe("db");

  openDlg(1);
  // 内包しているグループは、ボックスとクラスだけ選べる（クラスにすると子は消える。docs/CLASS-plan.md）
  const open = () => [...document.querySelectorAll<HTMLInputElement>('.mz-dlg-overlay input[name="shape"]')].filter(o => !o.disabled).map(o => o.value);
  expect(open()).toEqual(["box", "class"]);
  // 子の見せ方を非表示にすると枠ではなくなるので、形とサイズを選べるようになる（確定前でも）
  const view = dlg<HTMLInputElement>('input[name="view"][value="hidden"]')!;
  view.checked = true;
  view.dispatchEvent(new Event("change", { bubbles: true }));
  expect(open().length).toBe(SHAPES.length);
  expect([...document.querySelectorAll<HTMLInputElement>('.mz-dlg-overlay input[name="size"]')].some(i => !i.disabled)).toBe(true);
  cancel();
  expect(box(g, 1).childView).toBe("nest");
  openDlg(1);
  dlg<HTMLInputElement>('input[name="view"][value="list"]')!.checked = true;
  ok();
  expect(box(g, 1).childView).toBe("list");
  // ツリーの向き（ツリーのページのときだけ出る。パターンは作るときに決めるので、ツリーのページを開き直す）
  const tree = setup({ world: { childView: "tree", root: 1 }, nodes: [{ id: 1, x: 40, y: 40 }, { id: 2, parent: 1 }] });
  openBookDialog(tree.g, "e2e.json");
  tree.dlg<HTMLInputElement>('input[name="dir-"][value="left"]')!.checked = true;
  tree.dlgClick("[data-ok]");
  expect((tree.g.info(null) as { treeDirection: string }).treeDirection).toBe("left");
});

test("子のサイズをそろえるボタンは、そろえられる子が 2 つ以上あるときだけ出る。押すと印が付き、確定のときに 1 件の変更として行う", () => {
  const { g, dlg, openDlg, dlgClick, ok, notices } = setup({
    nodes: [
      { id: 1, caption: "枠", x: 40, y: 40 },
      { id: 2, parent: 1, x: 12, y: 30, width: 300 }, { id: 3, parent: 1, x: 12, y: 110 },
      { id: 4, x: 600, y: 40 }, { id: 5, parent: 4 },
    ],
  });
  openDlg(4);
  expect(dlg("[data-fit]")).toBeNull();
  dlgClick("[data-cancel]");
  openDlg(1);
  dlgClick('[data-fit="height"]');
  dlgClick('[data-fit="width"]'); // どれか 1 つ
  expect([...document.querySelectorAll("[data-fit]")].map(b => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
  expect(box(g, 2).w).toBe(300); // まだ行わない
  dlg<HTMLInputElement>('[name="caption"]')!.value = "そろえた枠";
  ok();
  expect([box(g, 2).w, box(g, 3).w]).toEqual([120, 120]);
  expect(notices.at(-1)).toBe("子 2 個の幅をそろえました");
  g.undo(); // キャプションとそろえたのは 1 件の変更
  expect([box(g, 1).caption, box(g, 2).w]).toEqual(["枠", 300]);
});

test("キャプションを 1 行にするのチェック。本文があれば押せず、グループには出さない（docs/SIZE-plan.md）", () => {
  const { g, dlg, openDlg, ok, cancel } = setup({ nodes: [{ id: 1, caption: "グループ", size: "L" }, { id: 2, caption: "文字", parent: 1 }, { id: 3, caption: "本文", body: "本文" }] });
  openDlg(2);
  const one = () => dlg<HTMLInputElement>('[name="one-line"]');
  expect(one()!.checked).toBe(false);
  one()!.checked = true;
  ok();
  expect(g.info(2).overflow).toBe("clip");
  openDlg(2);
  expect(one()!.checked).toBe(true);
  expect(dlg<HTMLTextAreaElement>('[name="body"]')!.disabled).toBe(true); // 1 行の箱は本文を書けない
  one()!.checked = false;
  ok();
  expect(g.info(2).overflow).toBe("wrap");
  openDlg(3);
  expect(one()!.disabled).toBe(true); // 本文があれば 1 行にできない
  cancel();
  openDlg(1); // グループには 1 行もサイズも出さない（サイズは子の並びで決まる）
  expect(one()).toBeNull();
  const sizes = [...document.querySelectorAll<HTMLInputElement>('.mz-dlg-overlay input[name="size"]')];
  expect(sizes.map(i => [i.disabled, i.checked])).toEqual([[true, false], [true, false], [true, false]]);
});

test("見た目: 枠線はボックスだけ、塗りつぶしはスティックマン以外に出す（効かないチェックは隠す）", () => {
  const { openDlg, cancel } = setup({
    nodes: [
      { id: 1, caption: "箱" }, { id: 2, caption: "DB", shape: "db" },
      { id: 3, caption: "分岐", shape: "diamond" }, { id: 4, caption: "人", shape: "person" },
    ],
  });
  const shown = (id: number) => {
    openDlg(id);
    const r = ["fill", "border"].map(k => !document.querySelector<HTMLElement>(`.mz-dlg-overlay [data-look="${k}"]`)!.hidden);
    cancel();
    return r;
  };
  expect([shown(1), shown(2), shown(3), shown(4)]).toEqual([[true, true], [true, false], [true, false], [false, false]]);
});

test("ツリーの中の子持ちの箱は、サイズを選べ、子の見せ方の代わりに案内を出す（見せ方のデータが内包のままでも）", () => {
  const { g, dlg, openDlg, cancel } = setup({ world: { childView: "tree", root: 1 }, nodes: [
    { id: 1, caption: "根" }, { id: 2, caption: "節", parent: 1 }, { id: 3, caption: "葉", parent: 2 },
  ] });
  const sizes = () => [...document.querySelectorAll<HTMLInputElement>('.mz-dlg-overlay input[name="size"]')];
  openDlg(2);
  expect(sizes().map(i => [i.disabled, i.checked])).toEqual([[false, false], [false, true], [false, false]]);
  expect(dlg('input[name="view"]')).toBeNull();
  expect(document.querySelector(".mz-dlg-overlay")!.textContent).toContain("ツリーのページの決まりで並びます");
  cancel();
  // ページを内包にすると、節は内包の枠になり、サイズは子の並びで決まる
  g.update(null, { childView: "nest" });
  openDlg(2);
  expect(sizes().every(i => i.disabled)).toBe(true);
  expect(dlg('input[name="view"]')).not.toBeNull();
});

test("背景の色はブックのダイアログのページのタブで、ボタンから開くポップアップで選ぶ（見本と「なし」）", () => {
  const { g, dlgClick } = setup({ nodes: [{ id: 1 }] });
  const pickIn = (sel: string) => document.querySelector<HTMLElement>(`.mz-cp ${sel}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  openBookDialog(g, "e2e.json");
  dlgClick('[data-tab-pane=""] [data-color-open]');
  pickIn('[data-name="#0f172a"]');
  dlgClick("[data-ok]");
  expect(g.toJSON().world?.background).toBe("#0f172a");
  openBookDialog(g, "e2e.json");
  dlgClick('[data-tab-pane=""] [data-color-open]');
  pickIn("[data-none]");
  dlgClick("[data-ok]");
  expect(g.toJSON().world?.background).toBeUndefined();
});

test("内包に変換は、ツリーのページのタブで押すと確かめ（キャンセルなら印を付けない）、確定したときに変換する", async () => {
  const { g, dlg, dlgClick } = setup({ world: { childView: "tree", root: 1 }, nodes: [
    { id: 1, caption: "根" }, { id: 2, caption: "節", parent: 1 }, { id: 3, caption: "葉", parent: 2 },
  ] });
  openBookDialog(g, "e2e.json");
  const flatten = () => dlg<HTMLElement>("[data-flatten]")!;
  flatten().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();
  document.querySelector<HTMLElement>("[data-sub-cancel]")!.click();
  await Promise.resolve();
  expect(flatten().getAttribute("aria-pressed")).toBe("false");
  flatten().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();
  document.querySelector<HTMLElement>("[data-sub-ok]")!.click();
  await new Promise(r => setTimeout(r, 0));
  expect(flatten().getAttribute("aria-pressed")).toBe("true");
  expect(g.toJSON().nodes.find(n => n.id === 2)!.parent).toBe(1); // まだ変換しない
  dlgClick("[data-ok]");
  expect(g.toJSON().nodes.find(n => n.id === 2)!.parent).toBeUndefined();
  expect(g.toJSON().edges).toHaveLength(2);
  expect(g.toJSON().world?.childView).toBeUndefined();
});

test("編集ダイアログを開いている間に外部の変更を読み込んでも、打ちかけは残り、確定すると開いた箱に書く", () => {
  const { g, openDlg } = setup({ nodes: [{ id: 1, caption: "API" }, { id: 2, caption: "DB" }] });
  openDlg(1);
  const caption = () => document.querySelector<HTMLInputElement>('.mz-dlg-overlay [name="caption"]')!;
  caption().value = "API サーバー";
  g.load({ nodes: [{ id: 1, caption: "API" }, { id: 2, caption: "DB（外部で変更）" }] }, { keepHistory: true });
  expect(caption().value).toBe("API サーバー");
  caption().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(box(g, 1).caption).toBe("API サーバー");
  expect(box(g, 2).caption).toBe("DB（外部で変更）");
});

test("形を選ぶ絵の並び: どの形もどれか 1 つのまとまりに入り、名前と絵を持つ", () => {
  const listed = SHAPE_GROUPS.flatMap(g => g.shapes);
  expect([...listed].sort()).toEqual([...SHAPES].sort());
  for (const s of SHAPES) {
    expect([s, !!SHAPE_LABELS[s]]).toEqual([s, true]);
    expect([s, /<(path|rect|circle|ellipse|g)\b/.test(shapeIcon(s, "x"))]).toEqual([s, true]);
  }
});

test("形を選ぶ絵の並び: どの箱でも全部の形を並べ、名前はポインタを乗せると出る", () => {
  const { openDlg, dlgClick } = setup({
    world: { childView: "flow" },
    nodes: [{ id: 1, caption: "外", x: 40, y: 40 }, { id: 3, caption: "中", x: 300, y: 40 }],
  });
  const values = () => [...document.querySelectorAll<HTMLInputElement>('.mz-dlg-overlay input[name="shape"]')].map(i => i.value);
  openDlg(1);
  expect([...values()].sort()).toEqual([...SHAPES].sort());
  dlgClick("[data-cancel]");
  openDlg(3);
  expect([...values()].sort()).toEqual([...SHAPES].sort());
  const label = document.querySelector<HTMLInputElement>('.mz-dlg-overlay input[name="shape"][value="trapezoidAlt"]')!.closest("label")!;
  expect(label.title).toBe(SHAPE_LABELS.trapezoidAlt);
});

test("サイズを書くと、今と同じサイズでも大きさの指定を外す", () => {
  const { g } = setup({ nodes: [{ id: 1, x: 40, y: 40, width: 312 }] });
  g.update(1, { size: "M" });
  expect(box(g, 1).w).toBe(120);
  expect("width" in g.toJSON().nodes[0]!).toBe(false);
  g.update(1, { size: "S" });
  expect(box(g, 1).size).toBe("S");
});

test("ワールドのデータの overflow は無視する（書き換えない）", () => {
  const { g } = setup({ world: { overflow: "clip" }, nodes: [{ id: 1 }] });
  expect(g.info(null).overflow).toBe("wrap");
  expect(() => g.update(null, { overflow: "clip" })).toThrow();
  expect(g.toJSON().world!.overflow).toBe("clip");
  expect(document.querySelector(".mz-world")!.classList.contains("mz-ov-clip")).toBe(false);
});
