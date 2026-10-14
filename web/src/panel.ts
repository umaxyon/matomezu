/*
 * サイドバー（D26 で、ふだんは隠れていて、タブ行の「追加削除」で左から出す形にした。docs/UI-plan.md）。
 * 中身は全ボックスの一覧（表示中と、消したもの）。表示中の行の × で消し、消したものの行を図へドラッグすると戻る（panel-list.ts）。
 * 選んだものの情報と設定（前の情報のタブ）は、編集ダイアログとブックのダイアログへ移した（情報の欄は保留。2026-10-14 ユーザー）。
 * 見た目は panel-style.ts。
 *
 * 使い方:
 *   const panel = createPanel(document.getElementById('sidebar'), graph);
 *   panel.shown();   // 見えるようにした（一覧が古ければ作り直す）
 *   panel.hidden();  // 隠した（隠れている間は一覧を作らない）
 */

import { closeColorPicker } from "./color-picker";
import { closeEditDialog } from "./edit-dialog";
import { injectStyle } from "./dom";
import type { Graph } from "./graph";
import { setupHelp } from "./help";
import { t } from "./i18n";
import { createListTab } from "./panel-list";
import { PANEL_CSS, STYLE_ID } from "./panel-style";

export type { Fold } from "./panel-list";

export interface Panel {
  shown(): void;  // サイドバーを出した（一覧が古ければ作り直す）
  hidden(): void; // サイドバーを隠した
  destroy(): void; // 吹き出しなど、サイドバーの外に作ったものを片付け、図の知らせから外れる
}

export function createPanel(el: HTMLElement, graph: Graph): Panel {
  injectStyle(STYLE_ID, PANEL_CSS);
  el.classList.add("mzp");
  const offHelp = setupHelp(el); // 見出しなどの「?」の吹き出し
  el.innerHTML = `<div class="mzp-tabs"><span class="mzp-tab" aria-selected="true">${t("追加削除")}</span></div>
    <div class="mzp-pane" data-pane="list"></div>`;
  const head = el.querySelector<HTMLElement>(".mzp-tabs")!;
  const list = createListTab(el.querySelector<HTMLElement>('[data-pane="list"]')!, graph);
  return {
    // 一覧の検索欄は見出しのすぐ下に貼り付ける（見出しの高さは文字の大きさで変わるので測る）
    shown: () => list.shown(head.offsetHeight),
    hidden: list.hidden,
    destroy() { list.destroy(); offHelp(); closeColorPicker(); closeEditDialog(); },
  };
}
