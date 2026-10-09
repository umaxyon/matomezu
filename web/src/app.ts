/*
 * matomezu のサーバーから開いたときの画面。ブック（ファイル）とページをアプリ内のタブで並べる（docs/TABS-plan.md）。
 * - ブック 1 つに、描画領域・サイドバー・図（graph）・同期（sync.ts）を 1 つずつ持つ。図はブック全体を持ち、1 ページだけを描く。
 *   同じブックのページのタブは、図と Undo の履歴を共有し、切り替えは graph.setPage で描き直す。
 * - タブ列はブックごとのタブグループ。先頭のタブが最初のページで、ブックの名前を出す（閉じるとブックごと閉じる）。
 *   その後ろに、ブックの全部のページのタブを並べる（ページの箱のキャプション）。ページのタブは閉じられない
 *   （ページの箱から飛ぶ手段を作らない方針なので、閉じると画面からそのページへ行けなくなるため。docs/TABS-plan.md）。
 *   ページが増えればタブも増え、無くなれば消える。
 * - 見ていないブックは隠しておき、外部の変更は前に出たときに反映する（隠れた要素では文字の幅が測れないため）。
 * - ツールバー（Undo/Redo、モード）は、前に出ているブックの図に付け替える。
 * - サーバーの通知は events.ts の 1 本で受け、ブックごとに配る。matomezu open などで頼まれたページは、タブを開いて前に出す。
 * - 表示中のページは URL（?d=<ブックの id>&p=<ページの箱の id>）に、開いているブックは localStorage に覚える（無くても動く。app-location.ts）。
 * - 付け替えのドラッグで、箱を同じブックのページのタブの上に少し止めると、そのページに切り替わる（そのまま落とすと、そのページへ移る）。
 * - サイドバーの一覧の「他ブックも表示」には、ほかに開いているブックの箱を出す（行を図へドラッグすると移植。docs/TABS-plan.md 4.3）。
 */

import { loadSavedBooks, saveBooks, wantedFromUrl, writeUrl } from "./app-location";
import { type EventConnection, connectEvents } from "./events";
import type { Graph } from "./graph";
import type { Minimap } from "./minimap";
import { handleGraphEvent } from "./notices";
import type { OtherBook, Panel } from "./panel";
import type { Preview } from "./preview";
import type { Diagram } from "./types";
import { docBase, fetchRemote, startSync, type Sync } from "./sync";
import { setupHistory, setupModes } from "./toolbar";
import { mountDiagram } from "./view";

export interface AppUi {
  tabs: HTMLElement;
  canvas: HTMLElement;
  sidebar: HTMLElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  modeButtons: HTMLButtonElement[];
  modeLabel: HTMLElement;
  preview: Preview;
  status(text: string): void;
  error(message: string): void;
  clearError(): void;
  hint(text: string): void;
}

type PageId = string | null; // ページの箱の id。null は最初のページ

interface PageTab {
  page: PageId;
  button: HTMLElement;
  label: HTMLElement;
}

interface Book {
  id: string;
  name: string;
  color: string;
  group: HTMLElement;       // タブグループ
  tabs: PageTab[];          // 先頭は最初のページ
  stage: HTMLElement;
  side: HTMLElement;
  graph: Graph;
  panel: Panel;
  sync: Sync;
  loaded: boolean;          // 図にデータを読み込んだか（前に出るまで読み込まない）
  minimap: Minimap;         // 右上の全体像（図の枠ごと。前に出ていない図の分は隠れる）
  data: unknown;            // 読み込む前の最新のデータ（ページのタブと、ほかのブックの一覧に使う。読み込んだら図から取る）
  error: string | null;
}

const HOVER_SWITCH = 500; // 付け替えのドラッグで、タブの上にこれだけ止めたらページを切り替える（ミリ秒）
const EMPTY_HINT = "開いている図がありません。LLM に matomezu open で開くよう頼んでください";
// ブックの色の印（タブグループの左端）
const BOOK_COLORS = ["#8b6cf0", "#22c55e", "#f97316", "#3b82f6", "#eab308", "#ec4899", "#14b8a6"];

// 取ってきたデータから、ページの箱の一覧を読む（図に読み込む前のタブの名前に使う）
function pagesInData(data: unknown): { id: string; caption: string }[] {
  const nodes = (data as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(n => n && n.page === true && n.id != null)
    .map(n => ({ id: String(n.id), caption: n.caption != null && n.caption !== "" ? String(n.caption) : String(n.id) }));
}

export async function startApp(ui: AppUi) {
  const books: Book[] = [];
  // ブック b が変わったら、ほかのブックのサイドバー（「他ブックも表示」で b を並べているもの）の一覧を古いとする
  const othersChanged = (b: Book) => { for (const o of books) if (o !== b) o.panel.othersChanged(); };
  let events: EventConnection | null = null; // サーバーの通知（下でつなぐ）
  let current: { book: Book; page: PageId } | null = null;
  let unbind: (() => void)[] = [];
  const opening = new Map<string, Promise<Book | null>>(); // 読み込み中のブック（同じブックを二重に開かない）
  // 付け替えのドラッグで、ポインタが乗っているタブと、切り替えるまでの時計
  let hover: { tab: PageTab; timer: ReturnType<typeof setTimeout> } | null = null;

  function endHover() {
    if (!hover) return;
    clearTimeout(hover.timer);
    hover.tab.button.classList.remove("tab-drop");
    hover = null;
  }

  // 付け替えのドラッグ中のポインタの位置。同じブックの、今と違うページのタブの上なら、少し止まったら切り替える
  function liftOver(b: Book, x: number, y: number) {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".tab");
    const tab = el ? b.tabs.find(t => t.button === el) : undefined;
    if (hover?.tab === tab) return;
    endHover();
    if (!tab || (current?.book === b && current.page === tab.page)) return;
    tab.button.classList.add("tab-drop");
    hover = { tab, timer: setTimeout(() => { const t = hover?.tab; endHover(); if (t) activate(b, t.page); }, HOVER_SWITCH) };
  }

  const pagesOf = (b: Book) => (b.loaded ? b.graph.pages() : pagesInData(b.data));

  // b から見たほかのブック。読み込んだブックは図から、まだのブックは取ってきた最新のデータから
  function othersOf(b: Book): OtherBook[] {
    return books.filter(x => x !== b).flatMap(x => {
      const data = x.loaded ? x.graph.toJSON() : x.data;
      return data && Array.isArray((data as Diagram).nodes) ? [{ id: x.id, name: x.name, data: data as Diagram }] : [];
    });
  }

  // 開いているブックを覚え、サーバーにも知らせる（サーバーは開いている図だけを監視する）
  function remember() {
    saveBooks(books.map(b => b.id));
    events?.watchChanged();
  }

  function refreshButtons(b: Book) {
    const h = b.graph.history();
    ui.undo.disabled = !h.canUndo;
    ui.redo.disabled = !h.canRedo;
  }

  function markSelected() {
    for (const b of books) {
      for (const t of b.tabs) {
        t.button.setAttribute("aria-selected", String(current?.book === b && current.page === t.page));
      }
    }
  }

  function makeTab(b: Book, page: PageId, name: string): PageTab {
    const button = document.createElement("div");
    button.className = page == null ? "tab tab-book" : "tab tab-page";
    button.setAttribute("role", "tab");
    const label = document.createElement("span");
    label.className = "tab-name";
    label.textContent = name;
    button.append(label);
    const tab: PageTab = { page, button, label };
    button.addEventListener("click", () => activate(b, page));
    // 閉じられるのはブック（先頭のタブ）だけ
    if (page == null) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "tab-close";
      x.title = "ブックを閉じる";
      x.setAttribute("aria-label", x.title);
      x.textContent = "×";
      x.addEventListener("click", e => { e.stopPropagation(); closeBook(b); });
      button.append(x);
    }
    return tab;
  }

  // ページのタブを開く（無ければ作る）。ブックに無いページなら null
  function pageTab(b: Book, page: PageId): PageTab | null {
    const found = b.tabs.find(t => t.page === page);
    if (found) return found;
    const info = pagesOf(b).find(p => p.id === page);
    if (!info) return null;
    const t = makeTab(b, page, info.caption);
    b.tabs.push(t);
    b.group.appendChild(t.button);
    remember();
    return t;
  }

  // 見出しに出すブックの名前。図の題名（world.title）があればそれ、無ければファイル名
  function titleOf(b: Book): string {
    const data = (b.loaded ? b.graph.toJSON() : b.data) as Diagram | null;
    const title = data?.world?.title;
    return typeof title === "string" && title.trim() ? title.trim() : b.name;
  }

  // ブックのタブの見出しを、図の題名に合わせる。ポインタを乗せるとファイル名が出る
  function refreshTitle(b: Book) {
    const first = b.tabs.find(t => t.page == null);
    if (first) {
      first.label.textContent = titleOf(b);
      first.button.title = b.name;
    }
    if (current?.book === b) updateDocumentTitle();
  }

  function updateDocumentTitle() {
    if (!current) return;
    const { book: b, page } = current;
    const pageName = page == null ? "" : `${b.tabs.find(t => t.page === page)?.label.textContent} - `;
    document.title = `${pageName}${titleOf(b)} - matomezu`;
  }

  // ページの増減やキャプションの変更に、タブを合わせる。増えたページのタブは足し、無くなったページのタブは閉じる。
  // ブックのタブの見出し（図の題名）もここで合わせる
  function refreshPages(b: Book) {
    refreshTitle(b);
    const pages = pagesOf(b);
    for (const p of pages) pageTab(b, p.id);
    for (const t of [...b.tabs]) {
      if (t.page == null) continue;
      const info = pages.find(p => p.id === t.page);
      if (info) t.label.textContent = info.caption;
      else closePage(b, t);
    }
    // 図の側で最初のページに戻った（描いていたページが無くなった）ら、選んでいるタブも合わせる
    if (current?.book === b && b.loaded && b.graph.page() !== current.page) {
      current = { book: b, page: b.graph.page() };
      markSelected();
      updateUrl();
    }
  }

  function updateUrl() {
    if (current) writeUrl(current.book.id, current.page);
  }

  function activate(b: Book, page: PageId) {
    const tab = pageTab(b, page) ?? b.tabs[0]!;
    page = tab.page;
    if (current?.book !== b) {
      for (const u of unbind) u();
      unbind = [];
      for (const x of books) {
        const on = x === b;
        x.stage.hidden = !on;
        x.side.hidden = !on;
        if (!on) x.sync.setActive(false);
      }
      // 見えるようにしてから前に出す（配置は見えている要素で文字を測る）
      b.sync.setActive(true);
      b.loaded = true;
      unbind.push(setupHistory(b.graph, ui.undo, ui.redo), setupModes(b.graph, ui.modeButtons, ui.modeLabel));
      ui.preview.attach(b.graph, b.stage);
      if (b.error) ui.error(b.error);
      else ui.clearError();
    }
    if (b.graph.page() !== page) {
      try {
        b.graph.setPage(page);
      } catch {
        page = null; // 読み込んだデータにそのページが無かった
        b.graph.setPage(null);
      }
    }
    current = { book: b, page };
    b.sync.report();
    refreshButtons(b);
    markSelected();
    updateDocumentTitle();
    updateUrl();
    remember();
  }

  function closePage(b: Book, t: PageTab) {
    const i = b.tabs.indexOf(t);
    if (i <= 0) return;
    b.tabs.splice(i, 1);
    t.button.remove();
    remember();
    if (current?.book === b && current.page === t.page) activate(b, b.tabs[Math.min(i, b.tabs.length - 1)]!.page);
  }

  function closeBook(b: Book) {
    const i = books.indexOf(b);
    if (i < 0) return;
    books.splice(i, 1);
    b.sync.close();
    b.minimap.destroy();
    b.panel.destroy();
    b.graph.destroy();
    b.stage.remove();
    b.side.remove();
    b.group.remove();
    remember();
    if (current?.book === b) {
      current = null;
      for (const u of unbind) u();
      unbind = [];
      const next = books[Math.min(i, books.length - 1)];
      if (next) activate(next, next.graph.page());
      else empty();
    }
  }

  function empty() {
    ui.preview.attach(null, null);
    document.title = "matomezu";
    ui.undo.disabled = ui.redo.disabled = true;
    ui.clearError();
    ui.hint(EMPTY_HINT);
  }

  // ブックを読み込んでタブグループを作る。サーバーが知らないブックなら null
  async function openBook(id: string): Promise<Book | null> {
    const found = books.find(b => b.id === id);
    if (found) return found;
    const loading = opening.get(id);
    if (loading) return loading;
    const p = (async () => {
      const base = docBase(id);
      const remote = await fetchRemote(base);
      if (!remote) return null;
      const again = books.find(b => b.id === id);
      if (again) return again;

      const stage = document.createElement("div");
      stage.className = "stage";
      stage.hidden = true;
      ui.canvas.prepend(stage);
      const side = document.createElement("div");
      side.className = "side-pane";
      side.hidden = true;
      ui.sidebar.appendChild(side);
      const group = document.createElement("div");
      group.className = "tab-group";
      const color = BOOK_COLORS[books.length % BOOK_COLORS.length]!;
      group.style.setProperty("--book", color);

      let book: Book | null = null;
      const { graph, panel, minimap } = mountDiagram(stage, side, { nodes: [] }, {
        onChange: data => { book?.sync.changed(data); if (book) { refreshPages(book); othersChanged(book); } },
        onHistory: () => { if (book && current?.book === book) refreshButtons(book); },
        onEvent: ev => { if (book && current?.book === book) handleGraphEvent(book.graph, ev, ui.status); },
        onBuild: () => { if (book) { refreshPages(book); othersChanged(book); } },
        onLiftOver: (x, y) => { if (book) liftOver(book, x, y); },
        onLiftEnd: endHover,
      }, { otherBooks: () => (book ? othersOf(book) : []) });
      const b: Book = {
        id, name: remote.name, color, group, tabs: [], stage, side, graph, panel, minimap,
        sync: null as unknown as Sync, loaded: false, data: remote.data, error: null,
      };
      b.sync = startSync(graph, base, remote, {
        status: text => { if (current?.book === b) ui.status(text); },
        error: message => { b.error = message; if (current?.book === b) ui.error(message); },
        clearError: () => { b.error = null; if (current?.book === b) ui.clearError(); },
      }, { active: false });
      const first = makeTab(b, null, remote.name);
      b.tabs.push(first);
      group.appendChild(first.button);
      for (const p of pagesOf(b)) pageTab(b, p.id);
      refreshTitle(b);
      ui.tabs.appendChild(group);
      book = b;
      books.push(b);
      remember();
      return b;
    })();
    opening.set(id, p);
    try {
      return await p;
    } finally {
      opening.delete(id);
    }
  }

  events = connectEvents({
    watched: () => books.map(b => b.id),
    version(doc, v) {
      const b = books.find(x => x.id === doc);
      if (!b) return;
      b.sync.notify(v);
      // まだ読み込んでいないブックは、ほかのブックの一覧に出すデータだけ取り直す
      if (!b.loaded) {
        fetchRemote(docBase(b.id)).then(r => {
          if (!r || b.loaded) return;
          b.data = r.data;
          refreshPages(b);
        });
      }
    },
    async open(doc, page) {
      const b = await openBook(doc);
      if (b) activate(b, page);
    },
    status: ui.status,
  });

  // 前に開いていたタブと、URL で指定されたページを開く（サーバーが知らないブックは開かない）
  const { book: wanted, page: wantedPage } = wantedFromUrl();
  const saved = loadSavedBooks();
  if (wanted && !saved.includes(wanted)) saved.push(wanted);
  await Promise.all(saved.map(openBook));
  // 並びは覚えていた順にそろえる（読み込みの終わった順ではなく）
  books.sort((a, b) => saved.indexOf(a.id) - saved.indexOf(b.id));
  for (const b of books) ui.tabs.appendChild(b.group);
  remember();
  if (current) return; // 読み込みの間に open の知らせで前に出たものがある
  const first = books.find(b => b.id === wanted) ?? books[0];
  if (first) activate(first, first.id === wanted ? wantedPage : null);
  else empty();
}
