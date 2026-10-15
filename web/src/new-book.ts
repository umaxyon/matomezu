/*
 * 新しいブックを作るダイアログ（残課題 D20）。マスターの道具箱の「ブック追加」から開く（D26 の段階 2）。
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
import { BG_PRESETS, PATTERN_OPTIONS, ROUTE_OPTIONS, THEME_HELP, WORLD_VIEW_HELP } from "./world-options";
import { DEFAULT_THEME, THEMES } from "./theme";
import type { PagePattern, WorldData } from "./types";
import { DEFAULT_PAPER, PAPERS, PAPER_NAMES, type PaperName } from "./validate";

const PATTERNS: [string, string][] = PATTERN_OPTIONS.filter(([v]) => STRATEGIES[v].pick);

// 紙の型（D33）の選択。choices が無ければ全部の型（validate.ts の PAPERS。足せば選択肢に出る）
export const PAPER_HELP = t("ページの大きさ（印刷の大きさ）。この中にまとめます。収まらないときは、まとめる・リストのスクロール・大きな紙・ページに分ける、の順で考えます");
export function paperSelect(value: string, choices: PaperName[] = PAPER_NAMES): string {
  return `<select class="mz-dlg-input" name="paper" aria-label="${t("紙")}">${choices.map(n =>
    `<option value="${n}"${n === value ? " selected" : ""}>${esc(PAPERS[n].label)}（${PAPERS[n].w}×${PAPERS[n].h}）</option>`).join("")}</select>`;
}

function seg(name: string, value: string, options: [string, string][]): string {
  return `<div class="mz-dlg-seg">${options.map(([v, label]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}>${esc(label)}</label>`).join("")}</div>`;
}

// ワールドの設定の欄（題名・テーマ・背景色・線の通り方・ページのパターン）。新しい図と、ページを足す画面（new-page.ts）で同じものを使う。
// title は題名の欄の見出しと説明。patterns は選べるパターン
export function worldFields(title: { label: string; help: string; placeholder: string }, patterns: [string, string][] = PATTERNS): string {
  return `<label class="mz-dlg-field"><span>${esc(title.label)}${helpIcon(title.help)}</span>
      <input class="mz-dlg-input" type="text" name="caption" value="" placeholder="${esc(title.placeholder)}"></label>
    <div class="mz-dlg-row"><span>${t("テーマ")}${helpIcon(THEME_HELP)}</span>
      <select class="mz-dlg-input" name="theme" aria-label="${t("テーマ")}">${THEMES.map(th =>
        `<option value="${th.id}"${th.id === DEFAULT_THEME ? " selected" : ""}>${esc(th.label)}</option>`).join("")}</select></div>
    <div class="mz-dlg-row"><span>${t("背景色")}</span>${colorButtonHtml(t("背景色を選ぶ"))}</div>
    <div class="mz-dlg-field"><span>${t("線の通り方（既定）")}</span>${seg("route", DEFAULT_ROUTE, ROUTE_OPTIONS)}</div>
    <div class="mz-dlg-field"><span>${t("ページのパターン")}${helpIcon(WORLD_VIEW_HELP)}</span>${seg("view", DEFAULT_VIEW, patterns)}</div>
    <div class="mz-dlg-row"><span>${t("紙")}${helpIcon(PAPER_HELP)}</span>${paperSelect(DEFAULT_PAPER)}</div>`;
}

// 背景色のボタンを動かす（サイドバーと同じ色のポップアップ。見本は背景によく使う色）。選んだ色を返す関数を返す
export function setupBackground(overlay: HTMLElement): () => string | null {
  let background: string | null = null;
  setupColorButton(overlay, () => ({
    value: background ?? "", paint: background ?? "transparent", text: background ?? t("なし"),
    palette: BG_PRESETS.map(c => ({ name: c, color: c })),
  }), c => { background = c; });
  return () => background;
}

// 欄の値を読む。選んだ値のうち既定と同じものは書かない（サイドバーで既定に戻したときと同じ形のデータにする）。title は world には書かない
export function readWorldFields(o: HTMLElement, background: string | null): { title: string; world: WorldData } {
  const field = (name: string) => o.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!.value;
  const picked = (name: string) => o.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)!.value;
  const world: WorldData = {};
  if (field("theme") !== DEFAULT_THEME) world.theme = field("theme");
  if (background) world.background = background;
  if (picked("route") !== DEFAULT_ROUTE) world.route = picked("route") as WorldData["route"];
  if (picked("view") !== DEFAULT_VIEW) world.childView = picked("view") as PagePattern;
  if (field("paper") !== DEFAULT_PAPER) world.paper = field("paper");
  return { title: field("caption").trim(), world };
}

// near は今見ているブックの id（そのフォルダに作る）。作れたら created に新しいブックの id を、作れなければ failed に理由を渡す。
// 最初のページのパターンにツリーは選べない（根の箱を置けるのは図を作ったあと。ツリーはページを足す画面で）
export function openNewBookDialog(near: string | null, created: (id: string) => void, failed: (message: string) => void): void {
  let background = () => null as string | null;
  const fields = worldFields({ label: t("図の題名"), help: t("タブの見出しと、ファイル名になります（空なら「無題」）"), placeholder: t("無題") },
    PATTERNS.filter(([v]) => !STRATEGIES[v as PagePattern].descendants)) +
    `<p class="mz-dlg-note">${near ? t("今見ている図と同じフォルダに作ります") : t("最後に開いた図と同じフォルダに作ります（置き場所は後で決めます）")}</p>`;
  const overlay = openDialog(t("新しい図"), t("作成"), fields, o => {
    const { title, world } = readWorldFields(o, background());
    if (title) world.title = title;
    createBook(near, title, world).then(created, (e: Error) => failed(e.message));
  });
  background = setupBackground(overlay);
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
