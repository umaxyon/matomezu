// サイドバーの操作のテスト
import { afterEach, expect, test } from "bun:test";
import { noticeOf } from "../web/src/notices";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import type { BoxInfo, Diagram } from "../web/src/types";
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
  const notices: string[] = [];
  graph = createGraph(stage, data, { measureText: fakeMeasure, onSelect: i => panel?.show(i), onEvent: ev => notices.push(noticeOf(ev)) });
  panel = createPanel(side, graph);
  const $ = <T extends Element>(sel: string) => side.querySelector<T>(sel);
  const click = (sel: string) => $<HTMLElement>(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // 入力欄の値を変えて確定する（ブラウザでは Enter やフォーカスが外れたときに change が起きる）
  const change = (sel: string, value?: string | boolean) => {
    const input = $<HTMLInputElement>(sel)!;
    if (typeof value === "boolean") input.checked = value;
    else if (value != null) input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // 鉛筆のボタンで編集ダイアログを開き、キャプションを書いて確定する
  const editCaption = (text: string) => {
    click("[data-edit-box]");
    const input = document.querySelector<HTMLInputElement>('.mz-dlg-overlay [name="caption"]')!;
    input.value = text;
    document.querySelector<HTMLElement>(".mz-dlg-overlay [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };
  return { g: graph, side, $, click, change, notices, editCaption };
}

const box = (g: Graph, id: number) => g.info(id) as BoxInfo;

test("選んだボックスの情報を出し、キャプションと色を変える（色はボタンから開くポップアップの値の欄で）", () => {
  const { g, $, click, editCaption } = setup({ nodes: [{ id: 1, caption: "API" }] });
  g.select(1);
  expect($(".mzp-title")!.textContent).toBe("API");
  editCaption("API ゲートウェイ");
  expect(box(g, 1).caption).toBe("API ゲートウェイ");
  expect($(".mzp-caption-text")!.textContent).toBe("API ゲートウェイ");
  click("[data-color-open]");
  const value = document.querySelector<HTMLInputElement>(".mz-cp-value")!;
  value.value = "#3b82f6";
  value.dispatchEvent(new Event("change", { bubbles: true }));
  expect(box(g, 1).color).toBe("#3b82f6");
  expect(document.querySelector(".mz-cp")).not.toBeNull(); // 決めても、同じ箱を選んでいる間は開いたまま
  g.select(null);
  expect(document.querySelector(".mz-cp")).toBeNull(); // 選ぶものが変わったら閉じる
});

test("編集ダイアログ: 鉛筆で開き、キャプションと本文と仕切りの線を 1 件の変更として書く。Esc なら書かずに閉じる", () => {
  const { g, click } = setup({ nodes: [{ id: 1, caption: "API" }] });
  g.select(1);
  click("[data-edit-box]");
  const dlg = () => document.querySelector<HTMLElement>(".mz-dlg-overlay");
  const field = <T extends HTMLElement>(name: string) => dlg()!.querySelector<T>(`[name="${name}"]`)!;
  expect(dlg()).not.toBeNull();
  expect(field<HTMLInputElement>("caption").value).toBe("API");
  field<HTMLInputElement>("caption").value = "書きかけ";
  field<HTMLInputElement>("caption").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(dlg()).toBeNull();
  expect(box(g, 1).caption).toBe("API");
  // 開き直して、本文と仕切りの線も変えて確定する（Ctrl+Enter）
  click("[data-edit-box]");
  field<HTMLInputElement>("caption").value = "API サーバー";
  field<HTMLTextAreaElement>("body").value = "一行目\n二行目";
  field<HTMLInputElement>("rule").checked = false;
  const before = g.history().canUndo;
  field<HTMLTextAreaElement>("body").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
  expect(dlg()).toBeNull();
  expect(g.toJSON().nodes[0]).toMatchObject({ caption: "API サーバー", body: "一行目\n二行目", bodyRule: false });
  expect(before).toBe(false);
  g.undo(); // 1 件の変更なので、1 回で全部戻る
  const n = g.toJSON().nodes[0]!;
  expect([n.caption, n.body, n.bodyRule]).toEqual(["API", undefined, undefined]);
});

test("編集ダイアログ: 本文を出せない箱（S・ほかの形）では、本文の欄を使えない", () => {
  const { g, click } = setup({ nodes: [{ id: 1, caption: "S", size: "S" }] });
  g.select(1);
  click("[data-edit-box]");
  const dlg = document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  expect(dlg.querySelector<HTMLTextAreaElement>('[name="body"]')!.disabled).toBe(true);
  expect(dlg.textContent).toContain("本文は、形がボックスで S 以外のサイズ、キャプションを 1 行にしていないときに出せます");
});

// 解釈できない色を受け付けない動き（panel.ts の CSS.supports での確認）は、ここでは確かめられない。
// この DOM の CSS.supports は何でも true を返し、しかも置き換えられないため。実際のブラウザでのテストで確かめる

test("色の見本と「なし」、塗りつぶし・枠線", () => {
  const { g, click, change } = setup({ nodes: [{ id: 1 }] });
  g.select(1);
  expect(box(g, 1).color).toBe(""); // 色を書いていない
  click("[data-color-open]");
  document.querySelector<HTMLElement>('.mz-cp [data-name="success"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(box(g, 1).color).toBe("success");
  document.querySelector<HTMLElement>(".mz-cp [data-none]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(box(g, 1).color).toBe("");
  change('[data-field="fill"]', false);
  change('[data-field="border"]', true);
  expect([box(g, 1).fill, box(g, 1).border]).toEqual([false, true]);
});

test("サイズを押すと、今と同じサイズでも大きさの指定を外す", () => {
  const { g, click } = setup({ nodes: [{ id: 1, x: 40, y: 40, width: 312 }] });
  g.select(1);
  click('input[name="mzp-size"][value="M"]');
  expect(box(g, 1).w).toBe(120);
  expect("width" in g.toJSON().nodes[0]!).toBe(false);
  click('input[name="mzp-size"][value="S"]');
  expect(box(g, 1).size).toBe("S");
});

test("形と子の見せ方、ツリーのときだけ向きを選べる", () => {
  const { g, $, change } = setup({ nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3 }] });
  g.select(3);
  change('input[name="mzp-shape"][value="db"]', true);
  expect(box(g, 3).shape).toBe("db");

  g.select(1);
  expect($('input[name="mzp-shape"]')).toBeNull(); // 内包しているグループは形を選べない
  expect($('input[name="mzp-treedir"]')).toBeNull();
  change('input[name="mzp-view"][value="tree"]', true);
  expect(box(g, 1).childView).toBe("tree");
  change('input[name="mzp-treedir"][value="left"]', true);
  expect(box(g, 1).treeDirection).toBe("left");
});

test("子のサイズのボタンは、そろえられる子が2つ以上あるときだけ出る", () => {
  const { g, $, click, notices } = setup({
    nodes: [
      { id: 1, x: 40, y: 40 },
      { id: 2, parent: 1, x: 12, y: 30, width: 300 }, { id: 3, parent: 1, x: 12, y: 110 },
      { id: 4, x: 600, y: 40 }, { id: 5, parent: 4 },
    ],
  });
  g.select(4);
  expect($("[data-fit]")).toBeNull();
  g.select(1);
  click('[data-fit="width"]');
  expect([box(g, 2).w, box(g, 3).w]).toEqual([120, 120]);
  expect(notices.at(-1)).toBe("子 2 個の幅をそろえました");
});

test("ワールドには中身の扱いを出さず、データの overflow は無視する（書き換えない）", () => {
  const { g, $ } = setup({ world: { overflow: "clip" }, nodes: [{ id: 1 }] });
  g.select(null);
  expect($('input[name="mzp-overflow"]')).toBeNull();
  expect(g.info(null).overflow).toBe("wrap");
  expect(() => g.update(null, { overflow: "clip" })).toThrow();
  expect(g.toJSON().world!.overflow).toBe("clip");
  expect(document.querySelector(".mz-world")!.classList.contains("mz-ov-clip")).toBe(false);
});

test("中身の扱い: 文字のボックスは「キャプションを 1 行にする」のチェック。グループには中身の扱いもサイズも出さない（docs/SIZE-plan.md）", () => {
  const { g, $, change } = setup({ nodes: [{ id: 1, caption: "グループ", size: "L" }, { id: 2, caption: "文字", parent: 1 }, { id: 3, caption: "本文", body: "本文" }] });
  g.select(2);
  expect($('input[name="mzp-overflow"]')).toBeNull();
  expect($<HTMLInputElement>("input[data-one-line]")!.checked).toBe(false);
  change("input[data-one-line]", true);
  expect(g.info(2).overflow).toBe("clip");
  expect($<HTMLInputElement>("input[data-one-line]")!.checked).toBe(true);
  change("input[data-one-line]", false);
  expect(g.info(2).overflow).toBe("wrap");
  g.select(3);
  expect($<HTMLInputElement>("input[data-one-line]")!.disabled).toBe(true); // 本文があれば 1 行にできない
  g.select(1);
  expect($('input[name="mzp-overflow"]')).toBeNull();
  expect($("input[data-one-line]")).toBeNull();
  const sizes = [...document.querySelectorAll<HTMLInputElement>('input[name="mzp-size"]')];
  expect(sizes.map(i => [i.disabled, i.checked])).toEqual([[true, false], [true, false], [true, false]]);
});

test("背景の色もボタンから開くポップアップで選ぶ（見本と「なし」）。外で閉じても、次に押すと開く", () => {
  const { g, click } = setup({ nodes: [{ id: 1 }] });
  g.select(null);
  const pickIn = (sel: string) => document.querySelector<HTMLElement>(`.mz-cp ${sel}`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  click("[data-color-open]");
  pickIn('[data-name="#0f172a"]');
  expect(g.toJSON().world?.background).toBe("#0f172a");
  pickIn("[data-none]");
  expect(g.toJSON().world?.background).toBeUndefined();
  // 外を押して閉じたあとも、ボタンを押せばまた開く（閉じたことをサイドバーが知る）
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(document.querySelector(".mz-cp")).toBeNull();
  click("[data-color-open]");
  expect(document.querySelector(".mz-cp")).not.toBeNull();
});

test("親・子・つながりのボタンで、そのボックスを選ぶ", () => {
  const { g, click } = setup({ nodes: [{ id: 1, caption: "親" }, { id: 2, caption: "子", parent: 1 }, { id: 3 }], edges: [[1, 3]] });
  g.select(2);
  click('[data-select="1"]');
  expect(g.selected()).toBe("1");
  click('[data-select="3"]'); // つながり
  expect(g.selected()).toBe("3");
});

test("タブで情報と追加削除を切り替える", () => {
  const { $, click } = setup({ nodes: [{ id: 1, caption: "API" }] });
  const hidden = () => [$<HTMLElement>('[data-pane="info"]')!.hidden, $<HTMLElement>('[data-pane="list"]')!.hidden];
  expect(hidden()).toEqual([false, true]);
  click('[data-tab="list"]');
  expect(hidden()).toEqual([true, false]);
  expect($('[data-tab="list"]')!.getAttribute("aria-selected")).toBe("true");
  click('[data-tab="info"]');
  expect(hidden()).toEqual([false, true]);
});

test("一覧: 表示中の × で子ごと消え、消したものに並ぶ。表示中の行を押すと選ぶ", () => {
  const { g, side, click, notices } = setup({
    nodes: [{ id: 1, caption: "親" }, { id: 2, caption: "子", parent: 1 }, { id: 3, caption: "隣" }],
    edges: [[1, 3]],
  });
  // 行ごとに「キャプション / 親の欄 / × の有無」
  const rows = (sel: string) => [...side.querySelectorAll<HTMLElement>(sel)].map(r =>
    [r.querySelector(".mzp-row-cap")!.textContent, r.querySelector(".mzp-row-parent")?.textContent ?? "", !!r.querySelector(".mzp-del")].join("/"));
  click('[data-tab="list"]');
  expect(rows('.mzp-row:not(.mzp-removed)')).toEqual(["1_親//true", "2_子/親 の中/true", "3_隣//true"]);
  expect(rows(".mzp-removed")).toEqual([]);
  click('[data-select="3"]');
  expect(g.selected()).toBe("3");
  click('[data-remove="1"]');
  expect(rows('.mzp-row:not(.mzp-removed)')).toEqual(["3_隣//true"]);
  expect(rows(".mzp-removed")).toEqual(["1_親//false", "2_子/親 の中/false"]);
  expect(side.querySelector('[data-restore="1"]')!.getAttribute("draggable")).toBe("true");
  expect(notices.at(-1)).toBe("「1_親」を消しました（子 1 個、線 1 本も）");
  // タブは追加削除のまま
  expect(side.querySelector<HTMLElement>('[data-pane="list"]')!.hidden).toBe(false);
});

test("一覧の区画は折りたためて、描き直しても開け閉めを保つ", () => {
  const { g, side, click } = setup({ nodes: [{ id: 1, caption: "a" }, { id: 2, caption: "b" }] });
  const fold = (name: string) => side.querySelector<HTMLDetailsElement>(`[data-fold="${name}"]`)!;
  click('[data-tab="list"]'); // 一覧は、タブを開いたときに作る
  expect([fold("live").open, fold("removed").open]).toEqual([true, true]);
  const d = fold("live");
  d.open = false;
  d.dispatchEvent(new Event("toggle")); // ブラウザでは開け閉めで起きる
  g.remove(1); // 一覧が描き直される
  expect([fold("live").open, fold("removed").open]).toEqual([false, true]);
});

test("一覧の検索欄: 入力した文字を id_キャプションに含む行だけを残し、検索中は閉じた区画も開く。Esc で戻す", () => {
  const { g, side, click } = setup({
    nodes: [{ id: 1, caption: "東京のAさん" }, { id: 2, caption: "大阪のBさん" }, { id: 12, caption: "東京のCさん" }],
  });
  click('[data-tab="list"]');
  const search = side.querySelector<HTMLInputElement>("[data-search]")!;
  const shown = () => [...side.querySelectorAll<HTMLElement>('[data-fold="live"] .mzp-row')].filter(r => !r.hidden).map(r => r.dataset.select);
  const live = () => side.querySelector<HTMLDetailsElement>('[data-fold="live"]')!;
  live().open = false;
  live().dispatchEvent(new Event("toggle"));
  search.value = "東京";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  expect(shown()).toEqual(["1", "12"]);
  expect(live().open).toBe(true);
  search.value = "12_";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  expect(shown()).toEqual(["12"]);
  // 図が変わって一覧が描き直されても、検索欄の文字と絞り込みは残る
  g.update(2, { caption: "大阪のBさん（変更）" });
  expect(search.value).toBe("12_");
  expect(shown()).toEqual(["12"]);
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(search.value).toBe("");
  expect(shown()).toEqual(["1", "2", "12"]);
  expect(live().open).toBe(false); // 検索をやめたら元の開け閉めに戻る
});

test("一覧は、データが変わったときに作り直す。隠れている間は作らず、タブを開いたときに作る。選択だけでは作り直さない", () => {
  const { g, side, click } = setup({ nodes: [{ id: 1, caption: "a" }, { id: 2, caption: "b" }] });
  const row = (id: string) => side.querySelector<HTMLElement>(`.mzp-row[data-select="${id}"]`);
  click('[data-tab="list"]');
  const first = row("1")!;
  g.select(2); // 選んだだけ（データは変わらない）
  expect(row("1")).toBe(first); // 一覧は作り直していない
  g.update(1, { caption: "A" }); // データが変わった（一覧が見えている）
  expect(row("1")!.querySelector(".mzp-row-cap")!.textContent).toBe("1_A");
  click('[data-tab="info"]');
  const before = row("1");
  g.update(1, { caption: "B" }); // 一覧が隠れている間の変更
  expect(row("1")).toBe(before); // まだ作り直さない
  click('[data-tab="list"]');
  expect(row("1")!.querySelector(".mzp-row-cap")!.textContent).toBe("1_B"); // 開いたら最新
  g.undo(); // 図の組み立て直し（Undo）でも作り直す
  expect(row("1")!.querySelector(".mzp-row-cap")!.textContent).toBe("1_A");
});

test("外部の変更を読み込んでも、選んでいる箱と、入力中の欄の打ちかけの文字とフォーカスを保つ（Esc なら元に戻す）", () => {
  const data = { nodes: [{ id: 1, caption: "API" }, { id: 2, caption: "DB" }] };
  const { g, $ } = setup(data);
  g.select(null);
  const input = () => $<HTMLInputElement>('[data-edit="title"]')!;
  input().focus();
  input().value = "構成図"; // 打ちかけ（まだ確定していない）
  g.load({ nodes: [{ id: 1, caption: "API" }, { id: 2, caption: "DB（外部で変更）" }] }, { keepHistory: true });
  expect(input().value).toBe("構成図");
  expect(document.activeElement).toBe(input());
  // Esc は打ちかけを捨てて、元の値に戻す
  input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(input().value).toBe("");
});

test("編集ダイアログを開いている間に外部の変更を読み込んでも、打ちかけは残り、確定すると開いた箱に書く", () => {
  const { g, click } = setup({ nodes: [{ id: 1, caption: "API" }, { id: 2, caption: "DB" }] });
  g.select(1);
  click("[data-edit-box]");
  const caption = () => document.querySelector<HTMLInputElement>('.mz-dlg-overlay [name="caption"]')!;
  caption().value = "API サーバー";
  g.load({ nodes: [{ id: 1, caption: "API" }, { id: 2, caption: "DB（外部で変更）" }] }, { keepHistory: true });
  expect(caption().value).toBe("API サーバー");
  caption().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(box(g, 1).caption).toBe("API サーバー");
  expect(box(g, 2).caption).toBe("DB（外部で変更）");
});
