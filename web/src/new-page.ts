/*
 * ページを足すダイアログ（D27 の段階 2。docs/TABS-plan.md）。ブックのタブの並びの右端の小さな「＋」から開く。
 * 題名・テーマ・背景色・線の通り方・ページのパターン（内包 / ツリー / フローチャート）を選んで「作成」すると、
 * そのブックにページを足し（graph.addPage）、できたページのタブを前に出す。パターンは作るときに決め、後から切り替えない。
 *
 *   openNewPageDialog(created);
 */

import { openDialog } from "./edit-dialog";
import { t } from "./i18n";
import { readWorldFields, setupBackground, worldFields } from "./new-book";
import type { WorldData } from "./types";

export function openNewPageDialog(created: (spec: { title: string; world: WorldData }) => void): void {
  let background = () => null as string | null;
  const fields = worldFields({ label: t("ページの題名"), help: t("タブの見出しになります（空ならページの id）"), placeholder: t("無題") }) +
    `<p class="mz-dlg-note">${t("ツリーを選ぶと、根の箱を 1 つ置いて始めます")}</p>`;
  const overlay = openDialog(t("新しいページ"), t("作成"), fields, o => created(readWorldFields(o, background())));
  background = setupBackground(overlay);
}
