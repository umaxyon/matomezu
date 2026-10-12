/*
 * 新しいブックを作るダイアログ（残課題 D20）。タブの列の左端の「＋」から開く。
 * ワールドの設定（題名・テーマ・背景色・線の通り方・子の見せ方）を選んで「作成」すると、サーバー（/api/new）が
 * 今見ているブックと同じフォルダに、題名の名前で空の図のファイルを作って登録する。置き場所と LLM の許可の決まりは D22 で詰める。
 * 選んだ値のうち既定と同じものは書かない（サイドバーで既定に戻したときと同じ形のデータにする）。
 *
 *   openNewBookDialog(near, created, failed);
 */

import { esc } from "./dom";
import { colorButtonHtml, openDialog, setupColorButton } from "./edit-dialog";
import { helpIcon } from "./help";
import { t } from "./i18n";
import { DEFAULT_ROUTE, DEFAULT_VIEW, STRATEGIES } from "./model";
import { BG_PRESETS, PATTERN_OPTIONS, ROUTE_OPTIONS, THEME_HELP, WORLD_VIEW_HELP } from "./panel-info";
import { DEFAULT_THEME, THEMES } from "./theme";
import type { PagePattern, WorldData } from "./types";

// 最初のページに掛けられるパターン。根の箱が要るパターン（ツリー）は、ページを足す画面（D27 の段階 2）で根を置けるようになるまで出さない
const WORLD_VIEWS: [string, string][] = PATTERN_OPTIONS.filter(([v]) => STRATEGIES[v].onWorld && !STRATEGIES[v].descendants);

function seg(name: string, value: string, options: [string, string][]): string {
  return `<div class="mz-dlg-seg">${options.map(([v, label]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}>${esc(label)}</label>`).join("")}</div>`;
}

// near は今見ているブックの id（そのフォルダに作る）。作れたら created に新しいブックの id を、作れなければ failed に理由を渡す
export function openNewBookDialog(near: string | null, created: (id: string) => void, failed: (message: string) => void): void {
  let background: string | null = null;
  const fields = `<label class="mz-dlg-field"><span>${t("図の題名")}${helpIcon(t("タブの見出しと、ファイル名になります（空なら「無題」）"))}</span>
      <input class="mz-dlg-input" type="text" name="caption" value="" placeholder="${t("無題")}"></label>
    <div class="mz-dlg-row"><span>${t("テーマ")}${helpIcon(THEME_HELP)}</span>
      <select class="mz-dlg-input" name="theme" aria-label="${t("テーマ")}">${THEMES.map(th =>
        `<option value="${th.id}"${th.id === DEFAULT_THEME ? " selected" : ""}>${esc(th.label)}</option>`).join("")}</select></div>
    <div class="mz-dlg-row"><span>${t("背景色")}</span>${colorButtonHtml(t("背景色を選ぶ"))}</div>
    <div class="mz-dlg-field"><span>${t("線の通り方（既定）")}</span>${seg("route", DEFAULT_ROUTE, ROUTE_OPTIONS)}</div>
    <div class="mz-dlg-field"><span>${t("ページのパターン")}${helpIcon(WORLD_VIEW_HELP)}</span>${seg("view", DEFAULT_VIEW, WORLD_VIEWS)}</div>
    <p class="mz-dlg-note">${t("今見ている図と同じフォルダに作ります")}</p>`;

  const overlay = openDialog(t("新しい図"), t("作成"), fields, o => {
    const field = (name: string) => o.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!.value;
    const picked = (name: string) => o.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)!.value;
    const title = field("caption").trim();
    const world: WorldData = {};
    if (title) world.title = title;
    if (field("theme") !== DEFAULT_THEME) world.theme = field("theme");
    if (background) world.background = background;
    if (picked("route") !== DEFAULT_ROUTE) world.route = picked("route") as WorldData["route"];
    if (picked("view") !== DEFAULT_VIEW) world.childView = picked("view") as PagePattern;
    createBook(near, title, world).then(created, (e: Error) => failed(e.message));
  });

  // 背景色は、サイドバーと同じ色のポップアップで選ぶ（見本は背景によく使う色）
  setupColorButton(overlay, () => ({
    value: background ?? "", paint: background ?? "transparent", text: background ?? t("なし"),
    palette: BG_PRESETS.map(c => ({ name: c, color: c })),
  }), c => { background = c; });
}

async function createBook(near: string | null, title: string, world: WorldData): Promise<string> {
  const res = await fetch("api/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ near: near ?? "", title, world }),
  });
  if (!res.ok) throw new Error(t("図を作れませんでした: {message}", { message: (await res.text()).trim() }));
  const { id } = await res.json() as { id: string };
  return id;
}
