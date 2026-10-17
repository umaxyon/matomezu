/*
 * ブックのダイアログ（D26。docs/UI-plan.md）。タブ行の左の「ブック」から開く。中にタブ: ブック・最初のページ・2 枚目…。
 * 開いているページのタブを選んだ状態で開く。タブを切り替えてもダイアログの大きさは変わらない（高さを決めて、中をスクロールする）。
 * - ブックのタブ: 題名（world.title。空ならファイル名）とファイルの名前。何を置くかは後で練る（2026-10-14 ユーザー: 今は最低限）
 * - ページのタブ: 題名（2 枚目から。最初のページの見出しはブックの題名）・パターン（読むだけ）・テーマ・背景色・線の通り方・ツリーの向き、
 *   パターンの一回きりの操作（中の箱のサイズ・自動で整列・内包に変換）。一回きりの操作は今描いているページだけで、押すと確定のときに行う印が付く
 *   （D26 の案 A）。内包に変換は戻せないので、印を付けるときに確かめる
 * 確定すると、変えた所だけを 1 件の変更として書く（graph.batch）。ページの設定は graph.updatePage
 *
 *   openBookDialog(graph, fileName);
 */

import { esc } from "./dom";
import { type Committed, colorButtonHtml, confirmInside, openDialog, overPaperNote, setupColorButton } from "./edit-dialog";
import type { Graph } from "./graph";
import { helpIcon } from "./help";
import { t } from "./i18n";
import { DEFAULT_ROUTE, STRATEGIES } from "./model";
import { pageWorld } from "./pages";
import { DEFAULT_THEME, THEMES } from "./theme";
import type { PagePatch, PagePattern, Route, Size, TreeDirection, WorldInfo } from "./types";
import { DEFAULT_PAPER, PAPERS, PAPER_NAMES, PATTERN_LABELS, type PaperName, isPaper } from "./validate";
import { PAPER_HELP, paperSelect } from "./new-book";
import { ALIGN_HELP, BG_PRESETS, FLATTEN_HELP, KID_SIZE_HELP, ROUTE_OPTIONS, THEME_HELP, TREE_DIR_OPTIONS, WORLD_VIEW_HELP } from "./world-options";

const ONCE_NOTE = t("押すと、確定したときに行います（もう一度押すと取りやめ）");
const isPattern = (v: unknown): v is PagePattern => typeof v === "string" && v in STRATEGIES && STRATEGIES[v as PagePattern].onWorld;

// ページ 1 枚分の、ダイアログに出す値
interface PageState {
  key: string;            // タブの鍵（最初のページは ""）
  id: string | null;      // ページの id（null は最初のページ）
  name: string;           // タブの名前
  title: string | null;   // ページの題名（最初のページは null。ブックの題名を使う）
  pattern: PagePattern;
  theme: string;          // 書いたテーマ（"" は受け継ぐ。最初のページは書いていなければ標準）
  background: string | null;
  route: Route;
  treeDirection: TreeDirection;
  paper: PaperName;       // 紙の型（D33）
  current: WorldInfo | null; // 今描いているページなら、その情報（一回きりの操作に使う）
}

function seg(name: string, value: string, options: [string, string][]): string {
  return `<div class="mz-dlg-seg">${options.map(([v, label]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}>${esc(label)}</label>`).join("")}</div>`;
}

function pageStates(graph: Graph): PageState[] {
  const data = graph.toJSON();
  const now = graph.page();
  return [{ id: null as string | null, caption: "" }, ...graph.pages()].map(p => {
    const w = pageWorld(data, p.id);
    const first = p.id == null;
    return {
      key: p.id ?? "", id: p.id, name: first ? t("最初のページ") : p.caption, title: first ? null : String(data.pages?.find(x => String(x.id) === p.id)?.title ?? ""),
      pattern: isPattern(w.childView) ? w.childView : "nest",
      theme: typeof w.theme === "string" ? w.theme : first ? DEFAULT_THEME : "",
      background: typeof w.background === "string" ? w.background : null,
      route: w.route === "straight" ? "straight" : DEFAULT_ROUTE,
      treeDirection: (["up", "left", "right"] as const).find(d => d === w.treeDirection) ?? "down",
      paper: isPaper(w.paper) ? w.paper : DEFAULT_PAPER,
      current: p.id === now ? graph.info(null) as WorldInfo : null,
    };
  });
}

// 選べる紙の型（D33）: 今描いているページは全部（小さくして収まらなければ確定のときに断る）。
// 描いていないページは、その場で収まるかを確かめられないので、縦横とも今以上の大きさだけ（大きくするのはいつでもできる）
function paperChoices(p: PageState): PaperName[] {
  if (p.current) return PAPER_NAMES;
  const now = PAPERS[p.paper];
  return PAPER_NAMES.filter(n => PAPERS[n].w >= now.w && PAPERS[n].h >= now.h);
}

function pagePane(p: PageState): string {
  const k = p.key;
  const themes = (p.id == null ? [] : [["", t("受け継ぐ（ブック全体）")]]).concat(THEMES.map(th => [th.id, th.label]));
  const cur = p.current;
  const canAlign = !!cur?.canAlign, canFlatten = !!cur?.canFlatten;
  const own = STRATEGIES[p.pattern];
  // パターンの一回きりの操作。今描いているページでなければ押せない（並べ直すには、そのページを描いている必要がある）
  const away = cur ? "" : `<p class="mz-dlg-note">${t("このページを開いているときに使えます")}</p>`;
  const kidSize = own.autoAlign ? `<div class="mz-dlg-row"><span>${t("中の箱のサイズ")}${helpIcon(KID_SIZE_HELP)}</span>
      <div class="mz-dlg-once">${(["L", "M", "S"] as const).map(v => `<button type="button" class="mz-dlg-btn" data-kid-size="${v}" aria-pressed="false"${canAlign ? "" : " disabled"}>${v}</button>`).join("")}</div></div>` : "";
  const align = own.autoAlign ? `<div class="mz-dlg-row"><span>${t("自動で整列")}${helpIcon(ALIGN_HELP)}</span>
      <div class="mz-dlg-once"><button type="button" class="mz-dlg-btn" data-auto-align aria-pressed="false"${canAlign ? "" : " disabled"}>${t("整列する")}</button></div></div>` : "";
  const flatten = own.descendants ? `<div class="mz-dlg-row"><span>${t("内包に変換")}${helpIcon(FLATTEN_HELP)}</span>
      <div class="mz-dlg-once"><button type="button" class="mz-dlg-btn" data-flatten aria-pressed="false"${canFlatten ? "" : " disabled"}>${t("内包に変換")}</button></div></div>` : "";
  const ops = kidSize + align + flatten;
  return `<div class="mz-dlg-pane" data-tab-pane="${esc(k)}" hidden>
      ${p.id == null ? `<p class="mz-dlg-note">${t("最初のページの見出しは、ブックの題名です（ブックのタブで変えます）")}</p>`
        : `<label class="mz-dlg-field"><span>${t("ページの題名")}${helpIcon(t("タブの見出しになります（空ならページの id）"))}</span>
          <input class="mz-dlg-input" type="text" name="title" value="${esc(p.title ?? "")}" placeholder="${esc(p.id)}"></label>`}
      <div class="mz-dlg-row"><span>${t("ページのパターン")}${helpIcon(WORLD_VIEW_HELP)}</span><span class="mz-dlg-value">${esc(PATTERN_LABELS[p.pattern])}</span>
        <span class="mz-dlg-note mz-dlg-inline">${t("作るときに決めます（後から変えません）")}</span></div>
      <div class="mz-dlg-row"><span>${t("テーマ")}${helpIcon(THEME_HELP)}</span>
        <select class="mz-dlg-input" name="theme" aria-label="${t("テーマ")}">${themes.map(([v, label]) =>
          `<option value="${esc(v!)}"${v === p.theme ? " selected" : ""}>${esc(label!)}</option>`).join("")}</select></div>
      <div class="mz-dlg-row"><span>${t("背景色")}${helpIcon(t("図の背景の色。書けばテーマの背景より優先します"))}</span>${colorButtonHtml(t("背景色を選ぶ"))}</div>
      <div class="mz-dlg-field"><span>${t("線の通り方（既定）")}${helpIcon(t("通り方を決めていない線は、これに従います"))}</span>${seg(`route-${k}`, p.route, ROUTE_OPTIONS)}</div>
      ${own.paper ? `<div class="mz-dlg-row"><span>${t("紙")}${helpIcon(PAPER_HELP)}</span>${paperSelect(p.paper, paperChoices(p))}</div>
        ${cur ? "" : `<p class="mz-dlg-note">${t("小さな紙にするときは、このページを開いてから変えます（収まるかを確かめるため）")}</p>`}` : ""}
      ${own.descendants ? `<div class="mz-dlg-field"><span>${t("ツリーの向き")}</span>${seg(`dir-${k}`, p.treeDirection, TREE_DIR_OPTIONS)}</div>` : ""}
      ${ops ? `<div class="mz-dlg-ops">${ops}${cur ? `<p class="mz-dlg-note">${ONCE_NOTE}</p>` : away}</div>` : ""}
    </div>`;
}

export function openBookDialog(graph: Graph, fileName: string): void {
  const pages = pageStates(graph);
  const info = graph.info(null) as WorldInfo;
  const start = pages.find(p => p.current)?.key ?? "";
  const tabs = [{ key: "\u0000book", name: t("ブック") }, ...pages.map(p => ({ key: p.key, name: p.name }))];
  const backgrounds = new Map<string, string | null>(pages.map(p => [p.key, p.background]));
  const fields = `<div class="mz-dlg-tabs" role="tablist">${tabs.map(x =>
      `<button type="button" class="mz-dlg-tab" role="tab" data-tab="${esc(x.key)}">${esc(x.name)}</button>`).join("")}</div>
    <div class="mz-dlg-panes">
      <div class="mz-dlg-pane" data-tab-pane="\u0000book" hidden>
        <label class="mz-dlg-field"><span>${t("ブックの題名")}${helpIcon(t("タブの見出しに出ます。空ならファイル名を出します（ファイル名は変わりません）"))}</span>
          <input class="mz-dlg-input" type="text" name="book-title" value="${esc(info.title ?? "")}" placeholder="${esc(fileName)}"></label>
        <div class="mz-dlg-row"><span>${t("ファイル")}</span><span class="mz-dlg-value">${esc(fileName)}</span></div>
      </div>
      ${pages.map(pagePane).join("")}
    </div>`;
  const overlay = openDialog(t("ブック"), t("確定"), fields, o => commit(o));
  overlay.querySelector(".mz-dlg")!.classList.add("mz-dlg-book");
  const pane = (key: string) => overlay.querySelector<HTMLElement>(`[data-tab-pane="${CSS.escape(key)}"]`)!;

  function show(key: string) {
    for (const b of overlay.querySelectorAll<HTMLElement>("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === key));
    for (const p of overlay.querySelectorAll<HTMLElement>("[data-tab-pane]")) p.hidden = p.dataset.tabPane !== key;
  }
  overlay.querySelector(".mz-dlg-tabs")!.addEventListener("click", e => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tab]") : null;
    if (b) show(b.dataset.tab!);
  });
  // ページごとの背景色のボタン
  for (const p of pages) {
    setupColorButton(overlay, () => {
      const c = backgrounds.get(p.key) ?? null;
      return { value: c ?? "", paint: c ?? "transparent", text: c ?? t("なし"), palette: BG_PRESETS.map(x => ({ name: x, color: x })) };
    }, c => backgrounds.set(p.key, c), pane(p.key));
  }
  // 一回きりの操作の印。中の箱のサイズはどれか 1 つ。内包に変換は戻せないので、印を付けるときに確かめる
  overlay.querySelector(".mz-dlg-panes")!.addEventListener("click", async e => {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>("[data-kid-size], [data-auto-align], [data-flatten]") : null;
    if (!b || b.disabled) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    if (on && b.hasAttribute("data-flatten") && !(await confirmInside(overlay,
      t("ツリーを平らにして、親子のつながりを線で引き直し、このページを内包のページにします。見た目はそのままで、箱を自由に動かせるようになります。\n元のツリーには戻せません（すぐ後なら元に戻す（Undo）で戻せます）。"), t("変換する")))) return;
    if (b.hasAttribute("data-kid-size")) for (const x of b.parentElement!.querySelectorAll("[data-kid-size]")) x.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-pressed", String(on));
  });
  show(start);

  function commit(o: HTMLElement): Committed {
    const bookTitle = o.querySelector<HTMLInputElement>('[name="book-title"]')!.value.trim();
    return graph.batch(() => {
      if (bookTitle !== (info.title ?? "")) graph.update(null, { title: bookTitle || null });
      let once: { kidSize: Size | null; align: boolean; flatten: boolean } | null = null;
      for (const p of pages) {
        const el = pane(p.key);
        const picked = (name: string) => el.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value;
        const patch: PagePatch = {};
        const title = el.querySelector<HTMLInputElement>('[name="title"]');
        if (title && title.value.trim() !== (p.title ?? "")) patch.title = title.value.trim() || null;
        const theme = el.querySelector<HTMLSelectElement>('[name="theme"]')!.value;
        if (theme !== p.theme) patch.theme = theme || null;
        const bg = backgrounds.get(p.key) ?? null;
        if (bg !== p.background) patch.background = bg;
        const route = picked(`route-${p.key}`) as Route | undefined;
        if (route && route !== p.route) patch.route = route;
        const dir = picked(`dir-${p.key}`) as TreeDirection | undefined;
        if (dir && dir !== p.treeDirection) patch.treeDirection = dir;
        const paper = el.querySelector<HTMLSelectElement>('[name="paper"]')?.value;
        if (paper && paper !== p.paper) patch.paper = paper;
        if (Object.keys(patch).length) graph.updatePage(p.id, patch);
        if (p.current) {
          once = {
            kidSize: (el.querySelector<HTMLElement>('[data-kid-size][aria-pressed="true"]')?.dataset.kidSize ?? null) as Size | null,
            align: el.querySelector('[data-auto-align][aria-pressed="true"]') != null,
            flatten: el.querySelector('[data-flatten][aria-pressed="true"]') != null,
          };
        }
      }
      // 一回きりの操作は、ページの設定を書いたあとの形で行う（内包に変換はパターンが変わるので最後）
      if (once?.kidSize) graph.setKidSize(once.kidSize);
      if (once?.align) graph.autoAlign();
      if (once?.flatten) graph.flattenTree();
    }) || overPaperNote(graph);
  }
}
