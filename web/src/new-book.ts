/*
 * 新しいブックを作るダイアログ（残課題 D20）。タブの列の左端の「＋」から開く。
 * ワールドの設定（題名・テーマ・背景色・線の通り方・子の見せ方）を選んで「作成」すると、サーバー（/api/new）が
 * 今見ているブックと同じフォルダに、題名の名前で空の図のファイルを作って登録する。置き場所と LLM の許可の決まりは D22 で詰める。
 * 選んだ値のうち既定と同じものは書かない（サイドバーで既定に戻したときと同じ形のデータにする）。
 *
 *   openNewBookDialog(near, created, failed);
 */

import { closeColorPicker, openColorPicker } from "./color-picker";
import { esc, injectStyle } from "./dom";
import { openDialog } from "./edit-dialog";
import { helpIcon } from "./help";
import { t } from "./i18n";
import { DEFAULT_ROUTE, DEFAULT_VIEW, STRATEGIES } from "./model";
import { BG_PRESETS, ROUTE_OPTIONS, THEME_HELP, VIEW_OPTIONS, WORLD_VIEW_HELP } from "./panel-info";
import { DEFAULT_THEME, THEMES } from "./theme";
import type { ChildView, WorldData } from "./types";

const STYLE_ID = "matomezu-new-book-style";
const CSS = `
.mz-nb-color { display: flex; align-items: center; gap: 6px; }
.mz-nb-swatch { width: 14px; height: 14px; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.5); }
`;

// ワールドに掛けられる並べ方（内包・フローチャート）
const WORLD_VIEWS = VIEW_OPTIONS.filter(([v]) => STRATEGIES[v as ChildView].onWorld);

function seg(name: string, value: string, options: [string, string][]): string {
  return `<div class="mz-dlg-seg">${options.map(([v, label]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}>${esc(label)}</label>`).join("")}</div>`;
}

// near は今見ているブックの id（そのフォルダに作る）。作れたら created に新しいブックの id を、作れなければ failed に理由を渡す
export function openNewBookDialog(near: string | null, created: (id: string) => void, failed: (message: string) => void): void {
  injectStyle(STYLE_ID, CSS);
  let background: string | null = null;
  const fields = `<label class="mz-dlg-field"><span>${t("図の題名")}${helpIcon(t("タブの見出しと、ファイル名になります（空なら「無題」）"))}</span>
      <input class="mz-dlg-input" type="text" name="caption" value="" placeholder="${t("無題")}"></label>
    <div class="mz-dlg-row"><span>${t("テーマ")}${helpIcon(THEME_HELP)}</span>
      <select class="mz-dlg-input" name="theme" aria-label="${t("テーマ")}">${THEMES.map(th =>
        `<option value="${th.id}"${th.id === DEFAULT_THEME ? " selected" : ""}>${esc(th.label)}</option>`).join("")}</select></div>
    <div class="mz-dlg-row"><span>${t("背景色")}</span>
      <button type="button" class="mz-dlg-btn mz-nb-color" data-color-open aria-haspopup="dialog" aria-label="${t("背景色を選ぶ")}">
        <span class="mz-nb-swatch"></span><span data-color-text>${t("なし")}</span></button></div>
    <div class="mz-dlg-field"><span>${t("線の通り方（既定）")}</span>${seg("route", DEFAULT_ROUTE, ROUTE_OPTIONS)}</div>
    <div class="mz-dlg-field"><span>${t("子の見せ方")}${helpIcon(WORLD_VIEW_HELP)}</span>${seg("view", DEFAULT_VIEW, WORLD_VIEWS)}</div>
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
    if (picked("view") !== DEFAULT_VIEW) world.childView = picked("view") as ChildView;
    createBook(near, title, world).then(created, (e: Error) => failed(e.message));
  });

  // 背景色は、サイドバーと同じ色のポップアップで選ぶ（見本は背景によく使う色）。ダイアログを閉じたら閉じる
  const btn = overlay.querySelector<HTMLElement>("[data-color-open]")!;
  const show = () => {
    btn.querySelector<HTMLElement>(".mz-nb-swatch")!.style.background = background ?? "transparent";
    btn.querySelector<HTMLElement>("[data-color-text]")!.textContent = background ?? t("なし");
  };
  let picking = false;
  btn.addEventListener("click", () => {
    if (picking) { closeColorPicker(); return; }
    openColorPicker({
      anchor: btn, value: background ?? "", paint: background ?? "#ffffff",
      palette: BG_PRESETS.map(c => ({ name: c, color: c })),
      onPick: c => { background = c; show(); }, onClose: () => { picking = false; },
    });
    picking = true;
  });
  // ダイアログの中を押したら閉じる（ダイアログは押した操作を外へ届けないので、ポップアップが自分で気づけない）
  overlay.querySelector(".mz-dlg")!.addEventListener("pointerdown", e => {
    if (picking && !(e.target instanceof Element && e.target.closest("[data-color-open]"))) closeColorPicker();
  });
  const gone = new MutationObserver(() => { if (!overlay.isConnected) { closeColorPicker(); gone.disconnect(); } });
  gone.observe(document.body, { childList: true });
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
