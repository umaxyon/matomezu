// マスターページ（D26 の段階 2。docs/UI-plan.md）: サーバーの状態のフォルダの master.json を 1 冊のブックとして開き、
// 開くたびに、登録した図の並び（/api/books）から中身を作り直す（「ユーザー」「AI」の箱に新しい 10 件の窓、残りは「その他のブック」）。
// 窓の縮図は、見えている窓のブックだけ取りに行く。マスターの追加削除（cross-list.ts）の行を窓へ落とすと、そのブックの郵便箱へ写しを送る（段階 4）。
// ブックのタブ・前に出す・開くのは app.ts
import { t } from "./i18n";
import { CROSS_MIME, type CrossPayload, createCrossList } from "./cross-list";
import type { Graph } from "./graph";
import { LINK_LOOK_DEFS } from "./link-box";
import type { SideToggle } from "./main";
import { sendMail } from "./mailbox";
import { openNewBookDialog } from "./new-book";
import { layoutScene } from "./offscreen-scene";
import { type Scene, sceneOf } from "./preview-art";
import { openSettings } from "./settings";
import { docBase, fetchRemote, type Sync } from "./sync";
import { toast } from "./toast";
import type { Diagram as DiagramData, PagePattern, WorldInfo } from "./types";
import { PATTERN_LABELS, isPattern } from "./validate";

// マスターの一覧の 1 行（サーバーの /api/books。internal/server/books.go）
interface BookRow { id: string; name: string; title: string; mtime: number; madeBy: string; pattern: string }
// マスターに窓を並べる数（新しい順。残りは「その他のブック」）と、リストの置き方（リストの幅の目安・見出しの高さ・リストどうしの間）。
// 窓はリストの行（縮図は右。D13）なので、行の高さは横に分ける窓の高さとリストの間隔で決まる。目安を外れても重なりは配置が直す
const MASTER_TOP = 10;
const LIST_W = 340, GROUP_HEAD = 30, GROUP_GAP = 24;
const ROW_H = LINK_LOOK_DEFS.side.win.h + 2 * LINK_LOOK_DEFS.side.gap;
// ユーザーが作ったブックと LLM が渡したブックの色（最初は色だけで分ける。専用の印は後で。2026-10-14 ユーザー）
const MADE_BY_COLOR = { user: "#3b82f6", ai: "#f59e0b" };

// マスターが使う、開いているブックの部分（app.ts の Book）
export interface MasterBook {
  id: string;
  loaded: boolean;
  master: boolean;
  stage: HTMLElement;
  graph: Graph;
  sync: Sync;
}

export interface MasterContext<B extends MasterBook> {
  side: SideToggle;
  crossList: HTMLElement;     // サイドバーの、マスターの追加削除
  error(message: string): void;
  books(): B[];               // 開いているブック
  current(): B | null;        // 前に出ているブック
  openBook(id: string, master?: boolean): Promise<B | null>;
  activate(b: B, page: string | null): void;
}

export function createMaster<B extends MasterBook>(ctx: MasterContext<B>) {
  // マスターの道具箱の操作（view.ts の onCommand）
  function masterCommand(key: "newBook" | "crossMove" | "settings") {
    if (key === "settings") return openSettings();
    if (key === "crossMove") {
      ctx.side.show(ctx.side.open() === "cross" ? null : "cross");
      return crossList.render();
    }
    // 新しいブック: マスターには今見ている図が無いので、サーバーの決まり（最後に登録した図のフォルダ）に作る（置き場所は D22 で詰める）
    openNewBookDialog(null, async id => {
      const b = await ctx.openBook(id);
      if (!b) return ctx.error(t("作った図を開けませんでした"));
      ctx.activate(b, null);
    }, ctx.error);
  }

  // マスターの窓に出すブック（開いたときの並び）と、作った縮図。縮図はファイルの最終更新（mtime）ごとに覚え、
  // マスターを開き直しても、変わっていないブックは並べ直さずに使い回す（2026-10-14 ユーザー）
  let rows = new Map<string, BookRow>();
  const scenes = new Map<string, { mtime: number; scene: Scene | "loading" }>();
  let masterBook: B | null = null;
  let masterRows: BookRow[] = []; // 開いたときの並び（新しい順）
  // ブックのデータ（窓の縮図と、追加削除の一覧・パターンの確かめに使う）。開いているブックなら図から、無ければ取りに行く。マスターを開き直すたびに捨てる
  const bookData = new Map<string, Promise<DiagramData | null>>();
  function loadBook(id: string): Promise<DiagramData | null> {
    const open = ctx.books().find(b => b.id === id && b.loaded);
    if (open) return Promise.resolve(open.graph.toJSON());
    let p = bookData.get(id);
    if (!p) {
      p = fetchRemote(docBase(id)).then(r => { const d = r?.data as DiagramData | undefined; return d && Array.isArray(d.nodes) ? d : null; });
      bookData.set(id, p);
    }
    return p;
  }
  const crossList = createCrossList(ctx.crossList, {
    books: () => masterRows.map(r => ({ id: r.id, title: r.title || r.name })),
    load: loadBook,
  });

  // 追加削除の行をマスターの窓へ落とすと、そのブックの郵便箱へ写しを送る。そのブックに同じパターンのページが無ければ、送らずに知らせる
  // （落とす時点で確かめる。2026-10-14 ユーザー: 案 A）
  function setupWindowDrops(b: B) {
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
        return ctx.error(t("「{book}」の郵便箱へ送れませんでした", { book: name }));
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
    const open = ctx.books().find(b => b.id === id && b.loaded);
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
    if (ctx.current()?.master) return refreshMaster();
    let id: string;
    let list: BookRow[];
    try {
      const [m, l] = await Promise.all([fetch("api/master", { cache: "no-store" }), fetch("api/books", { cache: "no-store" })]);
      if (!m.ok || !l.ok) throw new Error(`${m.status} / ${l.status}`);
      id = (await m.json()).id;
      list = (await l.json()).books;
    } catch (err) {
      return ctx.error(t("マスターを開けませんでした: {error}", { error: err instanceof Error ? err.message : String(err) }));
    }
    const b = await ctx.openBook(id, true);
    if (!b) return ctx.error(t("マスターを開けませんでした: {error}", { error: id }));
    if (masterBook !== b) setupWindowDrops(b);
    masterBook = b;
    rows = new Map(list.map(r => [r.id, r]));
    masterRows = list;
    bookData.clear(); // 縮図（scenes）は最終更新ごとに覚えているので捨てない
    ctx.activate(b, null);
    b.graph.load(masterData(list));
    b.sync.changed(b.graph.toJSON());
    builtFrom = JSON.stringify(list);
  }
  // 見ているマスターを、今の一覧で作り直す。「その他のブック」を開いていれば開いたまま。
  // 一覧（並び・題名・最終更新など）が前に作ったときと同じなら作り直さない（読み込み直すと、開いたときのはみ出しの調整がもう一度かかり、
  // 狭い画面では箱が寄せられて飛ぶ。2026-10-15）
  let refreshing: Promise<void> | null = null, again = false;
  let builtFrom = "";
  function refreshMaster(): Promise<void> {
    if (refreshing) { again = true; return refreshing; } // 作り直している間に届いた知らせは、終わってから 1 回だけ
    refreshing = (async () => {
      do {
        again = false;
        const b = masterBook;
        if (!b || ctx.current() !== b) return;
        let list: BookRow[];
        try {
          const l = await fetch("api/books", { cache: "no-store" });
          if (!l.ok) throw new Error(String(l.status));
          list = (await l.json()).books;
        } catch {
          return; // 取れなければ今のまま（次の知らせで取り直す）
        }
        if (ctx.current() !== b) return;
        if (JSON.stringify(list) === builtFrom) continue;
        builtFrom = JSON.stringify(list);
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

  return { open: openMaster, refresh: refreshMaster, command: masterCommand, bookWindow };
}
