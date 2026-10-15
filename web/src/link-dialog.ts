/*
 * ページのタブを図へドラッグして落としたときの、リンクの箱を作るダイアログ（D29。2026-10-16 ユーザー）。
 * 見せ方（窓枠 / 横に分ける / 縮図を出さない）と、リンク先のページ（文字で絞り込んで選ぶ。ドラッグしたページが初期値で、今のページ以外を選び直せる。
 * ページが多い・名前が長いとき、タブをスクロールして探す手間を省くため）。キャプションはリンク先のページの名前。キャンセルなら作らない。
 *
 *   openPageLinkDialog(graph, req, page); // req は落とした所（graph.addGhost が返したもの）
 */
import { esc } from "./dom";
import { openDialog } from "./edit-dialog";
import type { Graph } from "./graph";
import { t } from "./i18n";
import type { AddRequest } from "./interaction";
import { DEFAULT_LINK_LOOK, LINK_LOOK_OPTIONS } from "./link-box";
import { createSearchSelect } from "./search-select";
import type { BoxData, LinkLook } from "./types";

export function openPageLinkDialog(graph: Graph, req: AddRequest, page: string): void {
  const options = graph.pages().filter(p => p.id !== graph.page()).map(p => ({ value: p.id, label: p.caption }));
  const fields = `<div class="mz-dlg-field"><span>${t("リンク先のページ")}</span><div data-target></div></div>
    <div class="mz-dlg-field"><span>${t("見せ方")}</span>
      <div class="mz-dlg-seg">${LINK_LOOK_OPTIONS.map(([v, label]) => `<label><input type="radio" name="linkLook" value="${v}"${v === DEFAULT_LINK_LOOK ? " checked" : ""}>${esc(label)}</label>`).join("")}</div></div>
    <p class="mz-dlg-note">${t("キャプションは、リンク先のページの名前になります（あとで編集できます）")}</p>`;
  const select = createSearchSelect({ options, value: page, placeholder: t("ページを探す"), empty: t("リンクできるページがありません") });
  const overlay = openDialog(t("ページへのリンク"), t("作成"), fields, o => {
    const target = select.value() ?? page; // 初めからドラッグしたページを選んでいて、選びを外す操作は無い
    const look = (o.querySelector<HTMLInputElement>('[name="linkLook"]:checked')?.value ?? DEFAULT_LINK_LOOK) as LinkLook;
    const fields: Partial<BoxData> = { caption: options.find(x => x.value === target)?.label ?? target, link: target };
    if (look !== DEFAULT_LINK_LOOK) fields.linkLook = look;
    // 紙に収まらなければ足さず、閉じずに知らせる（D33）
    return graph.batch(() => { graph.add(req, fields); }) ? undefined : false;
  });
  overlay.querySelector("[data-target]")!.appendChild(select.el);
  select.focus();
}
