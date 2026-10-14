// サイドバー（追加削除の一覧。D26 で、ふだんは隠れていて、タブ行の「追加削除」で出す形にした）のテスト
import { afterEach, expect, test } from "bun:test";
import { noticeOf } from "../web/src/notices";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel } from "../web/src/panel";
import type { Diagram } from "../web/src/types";
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
  const notices: string[] = [];
  graph = createGraph(stage, data, { measureText: fakeMeasure, onEvent: ev => notices.push(noticeOf(ev)) });
  const panel = createPanel(side, graph);
  const click = (sel: string) => side.querySelector<HTMLElement>(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return { g: graph, side, click, notices, panel };
}

test("見出しは「追加削除」だけで、情報の欄は無い（編集ダイアログとブックのダイアログへ移した）", () => {
  const { side } = setup({ nodes: [{ id: 1, caption: "API" }] });
  expect(side.querySelector(".mzp-tabs")!.textContent).toBe("追加削除");
  expect(side.querySelector('[data-pane="info"]')).toBeNull();
});

test("一覧: 表示中の × で子ごと消え、消したものに並ぶ。表示中の行を押すと選ぶ", () => {
  const { g, side, click, notices, panel } = setup({
    nodes: [{ id: 1, caption: "親" }, { id: 2, caption: "子", parent: 1 }, { id: 3, caption: "隣" }],
    edges: [[1, 3]],
  });
  // 行ごとに「キャプション / 親の欄 / × の有無」
  const rows = (sel: string) => [...side.querySelectorAll<HTMLElement>(sel)].map(r =>
    [r.querySelector(".mzp-row-cap")!.textContent, r.querySelector(".mzp-row-parent")?.textContent ?? "", !!r.querySelector(".mzp-del")].join("/"));
  panel.shown();
  expect(rows('.mzp-row:not(.mzp-removed)')).toEqual(["1_親//true", "2_子/親 の中/true", "3_隣//true"]);
  expect(rows(".mzp-removed")).toEqual([]);
  click('[data-select="3"]');
  expect(g.selected()).toBe("3");
  click('[data-remove="1"]');
  expect(rows('.mzp-row:not(.mzp-removed)')).toEqual(["3_隣//true"]);
  expect(rows(".mzp-removed")).toEqual(["1_親//false", "2_子/親 の中/false"]);
  expect(side.querySelector('[data-restore="1"]')!.getAttribute("draggable")).toBe("true");
  expect(notices.at(-1)).toBe("「1_親」を消しました（子 1 個、線 1 本も）");
});

test("一覧の区画は折りたためて、描き直しても開け閉めを保つ", () => {
  const { g, side, panel } = setup({ nodes: [{ id: 1, caption: "a" }, { id: 2, caption: "b" }] });
  const fold = (name: string) => side.querySelector<HTMLDetailsElement>(`[data-fold="${name}"]`)!;
  panel.shown(); // 一覧は、見えるようにしたときに作る
  expect([fold("live").open, fold("removed").open]).toEqual([true, true]);
  const d = fold("live");
  d.open = false;
  d.dispatchEvent(new Event("toggle")); // ブラウザでは開け閉めで起きる
  g.remove(1); // 一覧が描き直される
  expect([fold("live").open, fold("removed").open]).toEqual([false, true]);
});

test("一覧の検索欄: 入力した文字を id_キャプションに含む行だけを残し、検索中は閉じた区画も開く。Esc で戻す", () => {
  const { g, side, panel } = setup({
    nodes: [{ id: 1, caption: "東京のAさん" }, { id: 2, caption: "大阪のBさん" }, { id: 12, caption: "東京のCさん" }],
  });
  panel.shown();
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

test("一覧は、データが変わったときに作り直す。隠れている間は作らず、見えるようにしたときに作る。選択だけでは作り直さない", () => {
  const { g, side, panel } = setup({ nodes: [{ id: 1, caption: "a" }, { id: 2, caption: "b" }] });
  const row = (id: string) => side.querySelector<HTMLElement>(`.mzp-row[data-select="${id}"]`);
  panel.shown();
  const first = row("1")!;
  g.select(2); // 選んだだけ（データは変わらない）
  expect(row("1")).toBe(first); // 一覧は作り直していない
  g.update(1, { caption: "A" }); // データが変わった（一覧が見えている）
  expect(row("1")!.querySelector(".mzp-row-cap")!.textContent).toBe("1_A");
  panel.hidden();
  const before = row("1");
  g.update(1, { caption: "B" }); // 一覧が隠れている間の変更
  expect(row("1")).toBe(before); // まだ作り直さない
  panel.shown();
  expect(row("1")!.querySelector(".mzp-row-cap")!.textContent).toBe("1_B"); // 開いたら最新
  g.undo(); // 図の組み立て直し（Undo）でも作り直す
  expect(row("1")!.querySelector(".mzp-row-cap")!.textContent).toBe("1_A");
});
