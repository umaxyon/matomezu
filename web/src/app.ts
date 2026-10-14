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
 * - サーバーの通知は events.ts の 1 本で受け、ブックごとに配る。check・set で頼まれたページは、タブを開いて前に出す（matomezu open は郵便箱。下）。
 * - 表示中のページは URL（?d=<ブックの id>&p=<ページの箱の id>）に、開いているブックは localStorage に覚える（無くても動く。app-location.ts）。
 * - 付け替えのドラッグで、箱を同じブックのページのタブの上に少し止めると、そのページに切り替わる（そのまま落とすと、そのページへ移る）。
 * - ブックをまたいで箱を持ち込むのは、マスターの追加削除（cross-list.ts。行を窓へ落とすと、そのブックの郵便箱へ写しを送る。D26 の段階 4）。
 * - マスターページ（D26 の段階 2。docs/UI-plan.md）: タブ行の左端のボタンで開く。サーバーの状態のフォルダの master.json を 1 冊のブックとして開き、
 *   開くたびに、登録した図の並び（/api/books）から中身を作り直す（「ユーザー」「AI」の箱に新しい 10 件の窓、残りは「その他のブック」）。
 *   窓の縮図は、見えている窓のブックだけ取りに行く。窓を押すとそのブックへ移る。新しい図・設定はマスターの道具箱から。
 * - タブは今のブックだけを見せる（ほかに開いているブックは、マスターから移る）。
 * - 郵便箱（mailbox.ts。D26 の段階 3）: 前に出ているブックの郵便箱を、タブ行のボタン（未読の数）とサイドバーで見せる。
 *   ブックを開いたとき（開閉の知らせ onBookOpen）に未読があればトーストで知らせる。matomezu open（ask）は、すぐ切り替えずに
 *   今のブックの郵便箱に入れ、「届いています」のダイアログを出す（今見ているページなら何もしない。check・set はすぐ前に出す）。
 */

import { keyOf } from "./dom";
import { t } from "./i18n";
import { loadSavedBooks, saveBooks, wantedFromUrl, writeUrl } from "./app-location";
import { type EventConnection, connectEvents } from "./events";
import type { Graph } from "./graph";
import type { Minimap } from "./minimap";
import { handleGraphEvent } from "./notices";
import type { Panel } from "./panel";
import type { Preview } from "./preview";
import type { Diagram } from "./types";
import { docBase, fetchRemote, startSync, type Sync } from "./sync";
import { setupHistory, setupModes } from "./toolbar";
import { mountDiagram } from "./view";
import { openNewBookDialog } from "./new-book";
import { openNewPageDialog } from "./new-page";
import { openBookDialog } from "./book-dialog";
import { layoutScene } from "./offscreen-scene";
import { type Scene, sceneOf } from "./preview-art";
import { openSettings } from "./settings";
import { toast } from "./toast";
import type { Diagram as DiagramData, PagePattern, WorldInfo } from "./types";
import { PATTERN_LABELS, isPattern } from "./validate";
import type { SideToggle } from "./main";
import { createCrossList, CROSS_MIME, type CrossPayload } from "./cross-list";
import { type MailBook, createMailbox, badgeText, fetchMail, openArrivedDialog, removeMail, sendMail } from "./mailbox";
import { LINK_LOOK_DEFS } from "./link-box";

export interface AppUi {
  tabs: HTMLElement;
  master: HTMLButtonElement;  // タブ行の左端の「マスター」（ブックの一覧。D26 の段階 2）
  book: HTMLButtonElement;    // タブ行の左の「ブック」（前に出ているブックのダイアログ。book-dialog.ts）
  side: SideToggle;           // サイドバー（追加削除の一覧か郵便箱）の出し入れ。一覧なら、前に出ているブックの一覧を見せる
  mailbox: HTMLElement;       // サイドバーの郵便箱（mailbox.ts。D26 の段階 3）
  mailBadge: HTMLElement;     // タブ行の郵便箱のボタンの未読の数
  crossList: HTMLElement;     // サイドバーの、マスターの追加削除（ブックをまたぐ一覧。cross-list.ts。D26 の段階 4）
  canvas: HTMLElement;
  sidebar: HTMLElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  modeButtons: HTMLButtonElement[];
  modeLabel: HTMLElement;
  preview: Preview;
  notice(text: string): void;     // 気づいてほしい知らせ（トースト）
  error(message: string): void;   // 直るまで出しておくエラー
  clearError(): void;
  empty(text: string | null): void; // 図の真ん中の案内（開いている図が無いとき。null で隠す）
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
  addPage: HTMLElement;     // タブグループの右端の小さな＋（ページを足す。new-page.ts）
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
  master: boolean;          // マスターページのブック（master.json）。開いているブックの覚えにも、URL にも入れない
}

// マスターの一覧の 1 行（サーバーの /api/books。internal/server/books.go）
interface BookRow { id: string; name: string; title: string; mtime: number; madeBy: string; pattern: string }
// マスターに窓を並べる数（新しい順。残りは「その他のブック」）と、リストの置き方（リストの幅の目安・見出しの高さ・リストどうしの間）。
// 窓はリストの行（縮図は右。D13）なので、行の高さは横に分ける窓の高さとリストの間隔で決まる。目安を外れても重なりは配置が直す
const MASTER_TOP = 10;
const LIST_W = 340, GROUP_HEAD = 30, GROUP_GAP = 24;
const ROW_H = LINK_LOOK_DEFS.side.win.h + 2 * LINK_LOOK_DEFS.side.gap;
// ユーザーが作ったブックと LLM が渡したブックの色（最初は色だけで分ける。専用の印は後で。2026-10-14 ユーザー）
const MADE_BY_COLOR = { user: "#3b82f6", ai: "#f59e0b" };

const HOVER_SWITCH = 500; // 付け替えのドラッグで、タブの上にこれだけ止めたらページを切り替える（ミリ秒）
const EMPTY_HINT = t("開いている図がありません。左上のマスターから新しい図を作るか、LLM に matomezu open で開くよう頼んでください");
// ブックの色の印（タブグループの左端）
const BOOK_COLORS = ["#8b6cf0", "#22c55e", "#f97316", "#3b82f6", "#eab308", "#ec4899", "#14b8a6"];

// 取ってきたデータから、ページの一覧（2 枚目から）を読む（図に読み込む前のタブの名前に使う）
function pagesInData(data: unknown): { id: string; caption: string }[] {
  const pages = (data as { pages?: unknown })?.pages;
  if (!Array.isArray(pages)) return [];
  return pages.filter(p => p && p.id != null)
    .map(p => ({ id: String(p.id), caption: typeof p.title === "string" && p.title.trim() ? p.title.trim() : keyOf(p.id, "") }));
}

export async function startApp(ui: AppUi) {
  const books: Book[] = [];
  // ブック b が変わったら、ほかのブックのサイドバー（「他ブックも表示」で b を並べているもの）の一覧を古いとする
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

  // ブックの開閉の知らせ（前に出した・閉じた。D26 の段階 3）。郵便箱の知らせがこれに登録する
  const bookOpened: ((b: Book) => void)[] = [], bookClosed: ((b: Book) => void)[] = [];
  const onBookOpen = (f: (b: Book) => void) => { bookOpened.push(f); };
  const onBookClose = (f: (b: Book) => void) => { bookClosed.push(f); };

  // 郵便箱。前に出したブックの郵便箱を読み、未読の数をボタンに出す。開いた直後に未読があればトーストで知らせる
  let noticeFor: string | null = null;
  const mailbox = createMailbox(ui.mailbox, {
    openBook: item => openFromMail(item),
    visible: () => ui.side.open() === "mail",
    onCount: n => {
      ui.mailBadge.textContent = badgeText(n);
      if (noticeFor && noticeFor === mailbox.doc() && n > 0 && ui.side.open() !== "mail") toast(t("郵便箱にアイテムが届いています（{n} 件）", { n }));
      noticeFor = null;
    },
  });
  onBookOpen(b => { noticeFor = b.id; mailbox.show(b.id); });
  onBookClose(b => { if (mailbox.doc() === b.id) mailbox.show(null); });
  async function openFromMail(item: MailBook) {
    const b = await openBook(item.book);
    if (b) activate(b, item.page);
    else ui.error(t("そのブックを開けませんでした"));
  }

  const pagesOf = (b: Book) => (b.loaded ? b.graph.pages() : pagesInData(b.data));

  // 開いているブックを覚え、サーバーにも知らせる（サーバーは開いている図だけを監視する）
  function remember() {
    saveBooks(books.filter(b => !b.master).map(b => b.id));
    events?.watchChanged();
  }

  function refreshButtons(b: Book) {
    const h = b.graph.history();
    ui.undo.disabled = !h.canUndo;
    ui.redo.disabled = !h.canRedo;
  }

  function markSelected() {
    document.body.classList.toggle("master", !!current?.book.master); // マスターでは、ブックの道具（ブック・追加削除）を隠す（index.html）
    ui.master.setAttribute("aria-pressed", String(!!current?.book.master));
    for (const b of books) {
      b.group.classList.toggle("tab-group-current", current?.book === b); // タブは今のブックだけを見せる（index.html）
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
      x.title = t("ブックを閉じる");
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
    b.group.insertBefore(t.button, b.addPage); // ＋はいつも右端
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
    if (current && !current.book.master) writeUrl(current.book.id, current.page);
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
        if (!on) { x.sync.setActive(false); x.panel.hidden(); }
      }
      if (ui.side.open() === "boxes") b.panel.shown();
      if (ui.side.open() === "cross" && !b.master) ui.side.show(null); // ブックをまたぐ一覧はマスターのもの
      for (const f of bookOpened) f(b);
      // 見えるようにしてから前に出す（配置は見えている要素で文字を測る）
      b.sync.setActive(true);
      b.loaded = true;
      unbind.push(setupHistory(b.graph, ui.undo, ui.redo), setupModes(b.graph, ui.modeButtons, ui.modeLabel));
      ui.preview.attach(b.graph, b.stage);
      ui.empty(null);
      ui.book.disabled = false;
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
    for (const f of bookClosed) f(b);
    // ブックを閉じたら、そのブックの LLM の履歴も消す（D31。2026-10-15 ユーザー: 見ていない変更もここで確定）
    if (!b.master) void fetch(docBase(b.id) + "api/llm", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
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
      else void openMaster().then(() => { if (!current) empty(); });
    }
  }

  function empty() {
    ui.preview.attach(null, null);
    document.title = "matomezu";
    ui.undo.disabled = ui.redo.disabled = true;
    ui.book.disabled = true;
    ui.clearError();
    ui.empty(EMPTY_HINT);
  }

  // ブックを読み込んでタブグループを作る。サーバーが知らないブックなら null
  async function openBook(id: string, master = false): Promise<Book | null> {
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
      // ページを足す＋（D27 の段階 2）。押すとダイアログ。足したページのタブを前に出す
      const addPage = document.createElement("button");
      addPage.type = "button";
      addPage.className = "tab-add";
      addPage.title = t("ページを足す");
      addPage.setAttribute("aria-label", addPage.title);
      addPage.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
      group.appendChild(addPage);

      let book: Book | null = null;
      const { graph, panel, minimap } = mountDiagram(stage, side, { nodes: [] }, {
        onChange: data => { book?.sync.changed(data); if (book) refreshPages(book); },
        onHistory: () => { if (book && current?.book === book) refreshButtons(book); },
        onEvent: ev => {
          if (!book || current?.book !== book) return;
          handleGraphEvent(book.graph, ev);
          if (ev.kind === "pasted") mailbox.pasted(); // 郵便箱から運んだ箱を置けた
        },
        onBuild: () => { if (book) refreshPages(book); },
        onLiftOver: (x, y) => { if (book) liftOver(book, x, y); },
        onLiftEnd: endHover,
        onOpenPage: page => { if (book) activate(book, page); }, // リンクの箱の窓（link-box.ts）
        // 見ていなかった LLM の変更を見た（D31）: サーバーの LLM の履歴に印を付ける
        onLLMSeen: version => { void fetch(base + "api/llm/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) }).catch(() => {}); },
        bookWindow: (id, visible) => bookWindow(id, visible), // マスターの窓（D26 の段階 2）
        onOpenBook: id => { void openBook(id).then(x => (x ? activate(x, null) : ui.error(t("そのブックを開けませんでした")))); },
      }, { onCommand: masterCommand }); // ブックをまたぐ持ち込みはマスターの追加削除へ移した（前の「他ブックも表示」は出さない。D26 の段階 4）
      const b: Book = {
        id, name: remote.name, color, group, addPage, tabs: [], stage, side, graph, panel, minimap,
        sync: null as unknown as Sync, loaded: false, data: remote.data, error: null, master,
      };
      if (master) group.classList.add("tab-group-master");
      b.sync = startSync(graph, base, remote, {
        status: () => {},
        notice: text => { if (current?.book === b) ui.notice(text); },
        error: message => { b.error = message; if (current?.book === b) ui.error(message); },
        clearError: () => { b.error = null; if (current?.book === b) ui.clearError(); },
      }, { active: false });
      const first = makeTab(b, null, remote.name);
      b.tabs.push(first);
      group.insertBefore(first.button, addPage);
      for (const p of pagesOf(b)) pageTab(b, p.id);
      addPage.addEventListener("click", () => {
        if (current?.book !== b) activate(b, null); // 図に読み込んでから足す
        openNewPageDialog(spec => activate(b, b.graph.addPage(spec)));
      });
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

  ui.book.addEventListener("click", () => { if (current) openBookDialog(current.book.graph, current.book.name); });
  ui.side.onChange(kind => {
    if (current) (kind === "boxes" ? current.book.panel.shown() : current.book.panel.hidden());
    if (kind === "mail") mailbox.refresh(); // 開いたら読んだことにする
  });

  // ---- マスター（D26 の段階 2） ----

  // マスターの道具箱の操作（view.ts の onCommand）
  function masterCommand(key: "newBook" | "crossMove" | "settings") {
    if (key === "settings") return openSettings();
    if (key === "crossMove") {
      ui.side.show(ui.side.open() === "cross" ? null : "cross");
      return crossList.render();
    }
    // 新しいブック: マスターには今見ている図が無いので、サーバーの決まり（最後に登録した図のフォルダ）に作る（置き場所は D22 で詰める）
    openNewBookDialog(null, async id => {
      const b = await openBook(id);
      if (!b) return ui.error(t("作った図を開けませんでした"));
      activate(b, null);
    }, ui.error);
  }

  // マスターの窓に出すブック（開いたときの並び）と、作った縮図。縮図はファイルの最終更新（mtime）ごとに覚え、
  // マスターを開き直しても、変わっていないブックは並べ直さずに使い回す（2026-10-14 ユーザー）
  let rows = new Map<string, BookRow>();
  const scenes = new Map<string, { mtime: number; scene: Scene | "loading" }>();
  let masterBook: Book | null = null;
  let masterRows: BookRow[] = []; // 開いたときの並び（新しい順）
  // ブックのデータ（窓の縮図と、追加削除の一覧・パターンの確かめに使う）。開いているブックなら図から、無ければ取りに行く。マスターを開き直すたびに捨てる
  const bookData = new Map<string, Promise<DiagramData | null>>();
  function loadBook(id: string): Promise<DiagramData | null> {
    const open = books.find(b => b.id === id && b.loaded);
    if (open) return Promise.resolve(open.graph.toJSON());
    let p = bookData.get(id);
    if (!p) {
      p = fetchRemote(docBase(id)).then(r => { const d = r?.data as DiagramData | undefined; return d && Array.isArray(d.nodes) ? d : null; });
      bookData.set(id, p);
    }
    return p;
  }
  const crossList = createCrossList(ui.crossList, {
    books: () => masterRows.map(r => ({ id: r.id, title: r.title || r.name })),
    load: loadBook,
  });

  // 追加削除の行をマスターの窓へ落とすと、そのブックの郵便箱へ写しを送る。そのブックに同じパターンのページが無ければ、送らずに知らせる
  // （落とす時点で確かめる。2026-10-14 ユーザー: 案 A）
  function setupWindowDrops(b: Book) {
    const windowAt = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(CROSS_MIME)) return null;
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(".mz-node[data-id^='b-']") : null;
      return el && rows.has(el.dataset.id!.slice(2)) ? el : null;
    };
    let over: HTMLElement | null = null;
    const mark = (el: HTMLElement | null) => { over?.classList.remove("mz-mail-drop"); over = el; el?.classList.add("mz-mail-drop"); };
    b.stage.addEventListener("dragover", e => {
      const el = windowAt(e);
      mark(el);
      if (!el) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });
    b.stage.addEventListener("dragleave", e => { if (!b.stage.contains(e.relatedTarget as Node)) mark(null); });
    b.stage.addEventListener("drop", async e => {
      const el = windowAt(e);
      mark(null);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const target = rows.get(el.dataset.id!.slice(2))!;
      const name = target.title || target.name;
      let item: CrossPayload;
      try { item = JSON.parse(e.dataTransfer!.getData(CROSS_MIME)); } catch { return; }
      const d = await loadBook(target.id);
      const patterns: string[] = d ? [d.world?.childView ?? "nest", ...(d.pages ?? []).map(p => p.world?.childView ?? "nest")] : [];
      if (!patterns.includes(item.pattern)) {
        const label = isPattern(item.pattern) ? PATTERN_LABELS[item.pattern] : item.pattern;
        return void toast(t("「{book}」には{pattern}のページが無いので、「{caption}」を送れません", { book: name, pattern: label, caption: item.caption }), { kind: "warn" });
      }
      if (!(await sendMail(target.id, { kind: "box", from: item.from, pattern: item.pattern, caption: item.caption, copy: item.copy as unknown as DiagramData }))) {
        return ui.error(t("「{book}」の郵便箱へ送れませんでした", { book: name }));
      }
      toast(t("「{caption}」を「{book}」の郵便箱へ送りました（コピー）", { caption: item.caption, book: name }));
    });
  }

  // 窓の題名・パターン・縮図（graph の bookWindow）。見えている窓で、まだ読んでいないブックなら取りに行き、届いたら描き直す
  function bookWindow(id: string, visible: boolean): { title: string; pattern: PagePattern; scene: Scene | null } | null {
    const row = rows.get(id);
    if (!row) return null;
    const pattern = isPattern(row.pattern) ? row.pattern : "nest";
    // 開いているブックで最初のページを描いていれば、その配置から（隠れていても、前に出ていたときの配置が残っている）
    const open = books.find(b => b.id === id && b.loaded);
    const cached = scenes.get(id);
    let scene = open && open.graph.page() == null ? sceneOf(open.graph.geometry(), (open.graph.info(null) as WorldInfo).backgroundPaint)
      : cached && cached.mtime === row.mtime ? cached.scene : undefined;
    if (scene == null && visible) {
      scenes.set(id, { mtime: row.mtime, scene: "loading" });
      // データを取ってきて、画面の外で実際に並べて縮図を作る（offscreen-scene.ts。近似では線や子が合わないため）
      void loadBook(id).then(data => (data ? layoutScene(data) : { w: 1, h: 1, bg: null, boxes: [], edges: [] })).then(sc => {
        scenes.set(id, { mtime: row.mtime, scene: sc });
        masterBook?.graph.redraw();
      });
    }
    return { title: row.title || row.name, pattern, scene: scene && scene !== "loading" ? scene : null };
  }

  // マスターの中身: 「ユーザー」「AI」のリストに新しい MASTER_TOP 件の窓、残りは「その他のブック」（非表示の箱。▼ でリストに開く）。
  // 窓の位置は覚えず、開くたびにこの並びで作り直す（2026-10-14 ユーザー）。窓はリストの行で、縮図は右（D13。細かい並べ方は後でユーザーが決める）
  function masterData(list: BookRow[]): DiagramData {
    const top = list.slice(0, MASTER_TOP), rest = list.slice(MASTER_TOP);
    const nodes: DiagramData["nodes"] = [];
    const win = (r: BookRow, parent: string, by: "user" | "ai") => nodes.push({
      id: "b-" + r.id, parent, caption: r.title || r.name, book: r.id, color: MADE_BY_COLOR[by],
    });
    const groups = [
      { id: "user", caption: t("ユーザー"), by: "user" as const, list: top.filter(r => r.madeBy === "user") },
      { id: "ai", caption: t("AI"), by: "ai" as const, list: top.filter(r => r.madeBy !== "user") },
    ];
    let bottom = 0;
    groups.forEach((g, gi) => {
      nodes.push({ id: g.id, caption: g.caption, color: MADE_BY_COLOR[g.by], childView: "list", x: 24 + gi * (LIST_W + GROUP_GAP), y: 24 });
      g.list.forEach(r => win(r, g.id, g.by));
      bottom = Math.max(bottom, Math.max(1, g.list.length) * ROW_H);
    });
    if (rest.length) {
      nodes.push({ id: "others", caption: t("その他のブック（{n} 冊）", { n: rest.length }), childView: "hidden", x: 24, y: 24 + GROUP_HEAD + bottom + GROUP_GAP * 2 });
      rest.forEach(r => win(r, "others", r.madeBy === "user" ? "user" : "ai"));
    }
    return { world: { childView: "master", title: t("マスター") }, nodes, edges: [] };
  }

  // マスターを開く: master.json を開いて前に出し、今の並びで中身を作り直して保存する。
  // マスターを見ているときは、取り直して作り直す（マスターのボタンを押したときと、ブックの一覧が変わった知らせ。2026-10-15 ユーザー）
  async function openMaster() {
    if (current?.book.master) return refreshMaster();
    let id: string;
    let list: BookRow[];
    try {
      const [m, l] = await Promise.all([fetch("api/master", { cache: "no-store" }), fetch("api/books", { cache: "no-store" })]);
      if (!m.ok || !l.ok) throw new Error(`${m.status} / ${l.status}`);
      id = (await m.json()).id;
      list = (await l.json()).books;
    } catch (err) {
      return ui.error(t("マスターを開けませんでした: {error}", { error: err instanceof Error ? err.message : String(err) }));
    }
    const b = await openBook(id, true);
    if (!b) return ui.error(t("マスターを開けませんでした: {error}", { error: id }));
    if (masterBook !== b) setupWindowDrops(b);
    masterBook = b;
    rows = new Map(list.map(r => [r.id, r]));
    masterRows = list;
    bookData.clear(); // 縮図（scenes）は最終更新ごとに覚えているので捨てない
    activate(b, null);
    b.graph.load(masterData(list));
    b.sync.changed(b.graph.toJSON());
  }
  // 見ているマスターを、今の一覧で作り直す。「その他のブック」を開いていれば開いたまま
  let refreshing: Promise<void> | null = null, again = false;
  function refreshMaster(): Promise<void> {
    if (refreshing) { again = true; return refreshing; } // 作り直している間に届いた知らせは、終わってから 1 回だけ
    refreshing = (async () => {
      do {
        again = false;
        const b = masterBook;
        if (!b || current?.book !== b) return;
        let list: BookRow[];
        try {
          const l = await fetch("api/books", { cache: "no-store" });
          if (!l.ok) throw new Error(String(l.status));
          list = (await l.json()).books;
        } catch {
          return; // 取れなければ今のまま（次の知らせで取り直す）
        }
        if (current?.book !== b) return;
        const openOthers = b.graph.toJSON().nodes.find(n => n.id === "others")?.childView;
        rows = new Map(list.map(r => [r.id, r]));
        masterRows = list;
        bookData.clear();
        const data = masterData(list);
        const others = data.nodes.find(n => n.id === "others");
        if (others && openOthers) others.childView = openOthers;
        b.graph.load(data);
        b.sync.changed(b.graph.toJSON());
      } while (again);
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  ui.master.addEventListener("click", () => void openMaster());

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
    async open(doc, page, ask) {
      const b = await openBook(doc);
      if (!b) return;
      // matomezu open（ask）: 今見ているページなら何もしない。ほかを見ていれば、今のブックの郵便箱に入れて「届いています」と聞く
      // （LLM は画面で今どれを見ているか分からないので、郵便箱だけでは伝わらない。2026-10-14 ユーザー）。何も見ていなければすぐ出す
      if (!ask || !current) return activate(b, page);
      if (current.book === b && current.page === page) return;
      const item: MailBook = { kind: "book", book: doc, page, name: titleOf(b) + (page ? ` / ${b.tabs.find(x => x.page === page)?.label.textContent ?? page}` : "") };
      const into = current.book.id;
      if (!(await sendMail(into, item))) return activate(b, page); // 郵便箱が使えなければ（状態のフォルダが無い）、すぐ出す
      openArrivedDialog(item, async () => {
        // 開いたら、届けた行を郵便箱から取り除く（キャンセルなら郵便箱に残る）
        const sent = (await fetchMail(into)).filter(m => m.body.kind === "book" && m.body.book === doc && m.body.page === page).pop();
        if (sent) void removeMail(into, sent.id);
        activate(b, page);
      });
    },
    mail(doc) { if (mailbox.doc() === doc) mailbox.refresh(); },
    books() { if (current?.book.master) void refreshMaster(); },
    // matomezu close: タブの × と同じに閉じる（開いていなければ何もしない。サーバーの登録は残る）
    close(doc) {
      const b = books.find(x => x.id === doc);
      if (b) closeBook(b);
    },
    status: () => {}, // 再接続中の知らせは出さない（つながらなければ同期のエラーが出る）
  });

  // 前に開いていたタブと、URL で指定されたページを開く（サーバーが知らないブックは開かない）
  const { book: wanted, page: wantedPage } = wantedFromUrl();
  const saved = loadSavedBooks();
  if (wanted && !saved.includes(wanted)) saved.push(wanted);
  await Promise.all(saved.map(id => openBook(id)));
  // 並びは覚えていた順にそろえる（読み込みの終わった順ではなく）
  books.sort((a, b) => saved.indexOf(a.id) - saved.indexOf(b.id));
  for (const b of books) ui.tabs.appendChild(b.group);
  remember();
  if (current) return; // 読み込みの間に open の知らせで前に出たものがある
  const first = books.find(b => b.id === wanted) ?? books[0];
  if (first) activate(first, first.id === wanted ? wantedPage : null);
  else await openMaster().then(() => { if (!current) empty(); }); // 開いているブックが無ければマスターを出す
}
