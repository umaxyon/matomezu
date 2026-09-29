/*
 * matomezu のサーバーから開いたときの画面。ブック（ファイル）とページをアプリ内のタブで並べる（docs/TABS-plan.md）。
 * - ブック 1 つに、描画領域・サイドバー・図（graph）・同期（sync.ts）を 1 つずつ持つ。図はブック全体を持ち、1 ページだけを描く。
 *   同じブックのページのタブは、図と Undo の履歴を共有し、切り替えは graph.setPage で描き直す。
 * - タブ列はブックごとのタブグループ。先頭のタブが最初のページで、ブックの名前を出す（閉じるとブックごと閉じる）。
 *   その後ろに、開いたページのタブを並べる（ページの箱のキャプション）。
 * - 見ていないブックは隠しておき、外部の変更は前に出たときに反映する（隠れた要素では文字の幅が測れないため）。
 * - ツールバー（Undo/Redo、モード）は、前に出ているブックの図に付け替える。
 * - サーバーの通知は events.ts の 1 本で受け、ブックごとに配る。matomezu open などで頼まれたページは、タブを開いて前に出す。
 * - 表示中のページは URL（?d=<ブックの id>&p=<ページの箱の id>）に、開いているタブは localStorage に覚える（無くても動く）。
 */

import { connectEvents } from "./events";
import { createGraph, type Graph } from "./graph";
import { createPanel, type Panel } from "./panel";
import { docBase, fetchRemote, startSync, type Sync } from "./sync";
import { setupHistory, setupModes } from "./toolbar";

export interface AppUi {
  tabs: HTMLElement;
  canvas: HTMLElement;
  sidebar: HTMLElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  modeButtons: HTMLButtonElement[];
  modeLabel: HTMLElement;
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
  initialPages: { id: string; caption: string }[]; // 読み込む前のページの一覧（取ってきたデータから）
  error: string | null;
}

interface Saved { d: string; p: string[] }

const STORE_KEY = "matomezu.tabs";
const EMPTY_HINT = "開いている図がありません。LLM に matomezu open で開くよう頼んでください";
// ブックの色の印（タブグループの左端）
const BOOK_COLORS = ["#8b6cf0", "#22c55e", "#f97316", "#3b82f6", "#eab308", "#ec4899", "#14b8a6"];

function loadSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.flatMap((x): Saved[] => {
      if (typeof x === "string") return [{ d: x, p: [] }]; // 以前の形（ブックの id だけ）
      if (x && typeof x.d === "string") return [{ d: x.d, p: Array.isArray(x.p) ? x.p.filter((p: unknown) => typeof p === "string") : [] }];
      return [];
    });
  } catch {
    return [];
  }
}

// 取ってきたデータから、ページの箱の一覧を読む（図に読み込む前のタブの名前に使う）
function pagesInData(data: unknown): { id: string; caption: string }[] {
  const nodes = (data as { nodes?: unknown })?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(n => n && n.page === true && n.id != null)
    .map(n => ({ id: String(n.id), caption: n.caption != null && n.caption !== "" ? String(n.caption) : String(n.id) }));
}

export async function startApp(ui: AppUi) {
  const books: Book[] = [];
  let current: { book: Book; page: PageId } | null = null;
  let unbind: (() => void)[] = [];
  const opening = new Map<string, Promise<Book | null>>(); // 読み込み中のブック（同じブックを二重に開かない）

  const pagesOf = (b: Book) => (b.loaded ? b.graph.pages() : b.initialPages);

  function remember() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(books.map(b => ({
        d: b.id, p: b.tabs.filter(t => t.page != null).map(t => t.page),
      }))));
    } catch { /* 覚えられなくても動く */ }
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
    const x = document.createElement("button");
    x.type = "button";
    x.className = "tab-close";
    x.title = page == null ? "ブックを閉じる" : "ページのタブを閉じる";
    x.setAttribute("aria-label", x.title);
    x.textContent = "×";
    button.append(label, x);
    const tab: PageTab = { page, button, label };
    button.addEventListener("click", () => activate(b, page));
    x.addEventListener("click", e => {
      e.stopPropagation();
      if (page == null) closeBook(b);
      else closePage(b, tab);
    });
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

  // ページの増減やキャプションの変更に、タブを合わせる。無くなったページのタブは閉じる
  function refreshPages(b: Book) {
    const pages = pagesOf(b);
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
    if (!current) return;
    try {
      const url = new URL(location.href);
      url.searchParams.set("d", current.book.id);
      if (current.page != null) url.searchParams.set("p", current.page);
      else url.searchParams.delete("p");
      history.replaceState(null, "", url);
    } catch { /* URL を変えられなくても動く */ }
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
    const pageName = page == null ? "" : `${b.tabs.find(t => t.page === page)?.label.textContent} - `;
    document.title = `${pageName}${b.name} - matomezu`;
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
      const graph = createGraph(stage, { nodes: [] }, {
        onSelect: info => book?.panel.show(info),
        onChange: data => { book?.sync.changed(data); if (book) refreshPages(book); },
        onHistory: () => { if (book && current?.book === book) refreshButtons(book); },
        onNotice: text => { if (book && current?.book === book) ui.status(text); },
        onBuild: () => { if (book) refreshPages(book); },
      });
      const panel = createPanel(side, graph);
      // 図の上でボックスを押したら、その情報を見せる（削除モードでは押すと消えるので切り替えない）
      stage.addEventListener("pointerdown", e => {
        if (e.target instanceof Element && e.target.closest(".mz-head") && graph.mode() !== "remove") panel.tab("info");
      });
      const b: Book = {
        id, name: remote.name, color, group, tabs: [], stage, side, graph, panel,
        sync: null as unknown as Sync, loaded: false, initialPages: pagesInData(remote.data), error: null,
      };
      b.sync = startSync(graph, base, remote, {
        status: text => { if (current?.book === b) ui.status(text); },
        error: message => { b.error = message; if (current?.book === b) ui.error(message); },
        clearError: () => { b.error = null; if (current?.book === b) ui.clearError(); },
      }, { active: false });
      const first = makeTab(b, null, remote.name);
      b.tabs.push(first);
      group.appendChild(first.button);
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

  connectEvents({
    version(doc, v) {
      books.find(b => b.id === doc)?.sync.notify(v);
    },
    async open(doc, page) {
      const b = await openBook(doc);
      if (b) activate(b, page);
    },
    status: ui.status,
  });

  // 前に開いていたタブと、URL で指定されたページを開く（サーバーが知らないブックは開かない）
  const params = new URLSearchParams(location.search);
  const wanted = params.get("d");
  const wantedPage = params.get("p");
  const saved = loadSaved();
  if (wanted && !saved.some(s => s.d === wanted)) saved.push({ d: wanted, p: [] });
  await Promise.all(saved.map(s => openBook(s.d)));
  // 並びは覚えていた順にそろえる（読み込みの終わった順ではなく）
  books.sort((a, b) => saved.findIndex(s => s.d === a.id) - saved.findIndex(s => s.d === b.id));
  for (const b of books) ui.tabs.appendChild(b.group);
  for (const s of saved) {
    const b = books.find(x => x.id === s.d);
    if (b) for (const p of s.p) pageTab(b, p);
  }
  remember();
  if (current) return; // 読み込みの間に open の知らせで前に出たものがある
  const first = books.find(b => b.id === wanted) ?? books[0];
  if (first) activate(first, first.id === wanted ? wantedPage : null);
  else empty();
}
