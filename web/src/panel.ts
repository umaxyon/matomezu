/*
 * サイドバー。タブが 2 つ:
 *   情報     … 選択中のボックスの情報と設定（panel-info.ts）
 *   追加削除 … 全ボックスの一覧（表示中と、消したもの）。表示中の行の × で消し、消したものの行を図へドラッグすると戻る（panel-list.ts）
 * 見た目は panel-style.ts。
 *
 * 使い方:
 *   let panel;
 *   const graph = createGraph(stage, data, { onSelect: info => panel?.show(info) });
 *   panel = createPanel(document.getElementById('sidebar'), graph);
 *   panel.tab("info");           // タブを切り替える
 */

import { injectStyle } from "./dom";
import type { Graph } from "./graph";
import { setupHelp } from "./help";
import { createInfoTab } from "./panel-info";
import { createListTab, type OtherBook } from "./panel-list";
import { PANEL_CSS, STYLE_ID } from "./panel-style";
import type { Info } from "./types";

export type { Fold, OtherBook } from "./panel-list";

export type PanelTab = "info" | "list";

export interface Panel {
  show(info: Info): void;
  tab(name: PanelTab): void;
  othersChanged(): void; // ほかのブックが変わった（「他ブックも表示」なら一覧を古いとし、見えていればすぐ作り直す）
  destroy(): void; // 吹き出しなど、サイドバーの外に作ったものを片付け、図の知らせから外れる
}

export interface PanelOptions {
  otherBooks?: () => OtherBook[]; // ほかのブック（サーバーから開いたときだけ。無ければ「他ブックも表示」を出さない）
}

export function createPanel(el: HTMLElement, graph: Graph, o: PanelOptions = {}): Panel {
  injectStyle(STYLE_ID, PANEL_CSS);
  el.classList.add("mzp");
  const offHelp = setupHelp(el); // 見出しなどの「?」の吹き出し
  el.innerHTML = `<div class="mzp-tabs" role="tablist">
      <button type="button" class="mzp-tab" role="tab" data-tab="info">情報</button>
      <button type="button" class="mzp-tab" role="tab" data-tab="list">追加削除</button>
    </div>
    <div class="mzp-pane" role="tabpanel" data-pane="info"></div>
    <div class="mzp-pane" role="tabpanel" data-pane="list"></div>`;
  const tabBar = el.querySelector<HTMLElement>(".mzp-tabs")!;
  const infoPane = el.querySelector<HTMLElement>('[data-pane="info"]')!;
  const listPane = el.querySelector<HTMLElement>('[data-pane="list"]')!;
  const info = createInfoTab(infoPane, graph);
  const list = createListTab(listPane, graph, o.otherBooks);

  function tab(name: PanelTab) {
    for (const b of tabBar.querySelectorAll<HTMLElement>("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    infoPane.hidden = name !== "info";
    listPane.hidden = name !== "list";
    // 一覧の検索欄はタブのすぐ下に貼り付ける（タブの高さは文字の大きさで変わるので測る）
    if (name === "list") list.shown(tabBar.offsetHeight);
    else list.hidden();
  }

  tabBar.addEventListener("click", e => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tab]") : null;
    if (b) tab(b.dataset.tab as PanelTab);
  });

  tab("info");
  return {
    show: next => info.show(next),
    tab,
    othersChanged: list.othersChanged,
    destroy() { list.destroy(); offHelp(); },
  };
}
