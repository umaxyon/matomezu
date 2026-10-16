// AI の問いの話題の、画面の側（D36。matomezu ask。internal/server/ask.go。docs/ASK-plan.md）。2026-10-16 ユーザーと決めた決まり:
// - 話題はサーバーが持つ（ファイルには書かない）。画面はつないだとき・変わったと知らされたとき（askchanged）に読み直して描く
// - 出すとき（ask）の決まりはフォーカスと同じ: フォーカスの反応待ちなら断る（pending）、手すきでなければ断る（busy）、
//   今のブックならそのページへ移って出す（shown）、ほかのブックなら移るかを確かめる（asked。答えはサーバーへ）
// - 話題の箱は 1 ページに限る（パレットからページをまたがない）
// - 吹き出しと印は graph.askBubbles（ask-bubbles.ts）。タブ行の真ん中にパレット「AI の問い 0 / 5 [A][B]…」（押すとその問いへスクロールし、隠していれば開く）
// - 吹き出しに収まらない問いはドロワー（ask-drawer.ts）。印かパレットで開く
// - ユーザーの操作（答えた・見た・隠した・開いた・答えない）はサーバーへ送る。話題を終わらせるのはいつも AI
import { esc } from "./dom";
import { openSimpleDialog } from "./edit-dialog";
import type { Graph } from "./graph";
import { t } from "./i18n";
import type { BubbleItem } from "./ask-bubbles";
import { createAskDrawer } from "./ask-drawer";
import { pageOf } from "./pages";
import { ASK_COLOR } from "./theme";
import type { Diagram } from "./types";

interface AskBook { id: string; loaded: boolean; data: unknown; graph: Graph }

export interface AskItem {
  id: string; box: string; text?: string; choices?: string[]; multi?: boolean; input?: boolean;
  view: "bubble" | "drawer"; letter?: string; state: "open" | "hidden" | "answered" | "seen" | "declined"; answer?: string[]; note?: string;
}
export interface Topic { doc: string; path: string; state: "asking" | "open" | "declined" | "closed"; items: AskItem[] }

export interface AskContext<B extends AskBook> {
  books(): B[];
  current(): { book: B; page: string | null } | null;
  openBook(id: string): Promise<B | null>;
  activate(b: B, page: string | null): void;
  title(b: B): string;
  busy(): boolean;         // ユーザーが手すきでない（app-point.ts と同じ決まり）
  focusWaiting(): boolean; // フォーカスの反応待ち（同時に追うのは 1 つ）
  palette: HTMLElement;
  drawerHost: HTMLElement; // ドロワーを重ねる所（図の枠）
  frame(b: B, box: string): void; // フォーカスの枠だけを出す（focus -button。反応待ちは話題が持つ）
}

const done = (it: AskItem) => it.state === "answered" || it.state === "seen" || it.state === "declined";
// 隠した吹き出し（印に縮めた）。状態の名前が並べ方の「非表示」と同じ綴りなので、比べる式にせず集合で引く（test/rules.test.ts）
const FOLDED = new Set<AskItem["state"]>(["hidden"]);
const folded = (it: AskItem) => FOLDED.has(it.state);

export function createAsker<B extends AskBook>(ctx: AskContext<B>) {
  // パレットとドロワーの色（図の外なので、既定のテーマの色。図の中の吹き出しはページのテーマの ask）
  document.documentElement.style.setProperty("--ask", ASK_COLOR);
  let topic: Topic | null = null;
  let page: string | null = null; // 話題の箱が載っているページ

  // ドロワー（ask-drawer.ts）。答えたら閉じる
  const drawer = createAskDrawer(ctx.drawerHost, {
    answer: (id, answer, note) => setItem(id, { state: "answered", answer, note }),
    decline: id => setItem(id, { state: "declined" }),
    seen: id => setItem(id, { state: "seen" }),
    reveal: box => { const b = topic ? ctx.books().find(x => x.id === topic!.doc) : undefined; try { b?.graph.reveal(box); } catch { /* 箱が消えた */ } },
  });
  function openDrawer(it: AskItem) {
    const b = topic ? ctx.books().find(x => x.id === topic!.doc) : undefined;
    const node = b ? nodesOf(b).find(n => String(n.id) === it.box) : undefined;
    drawer.open(it, { caption: String(node?.caption ?? it.box) });
  }

  const post = (body: object) => fetch("api/ask/screen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  const nodesOf = (b: B) => ((b.loaded ? b.graph.toJSON() : b.data) as Diagram | null)?.nodes ?? [];

  async function refresh() {
    try {
      const r = await fetch("api/ask", { cache: "no-store" });
      const v = r.ok ? await r.json() : null;
      topic = v && typeof v.doc === "string" && v.doc ? v as Topic : null;
    } catch { topic = null; }
    if (topic) {
      const b = ctx.books().find(x => x.id === topic!.doc);
      const first = topic.items[0];
      page = b && first ? pageOf(nodesOf(b), first.box) : null;
    }
    render();
  }

  // ユーザーの操作をすぐ画面に映してから送る（askchanged で読み直しても同じになる）
  function setItem(id: string, patch: Partial<AskItem>) {
    const it = topic?.items.find(x => x.id === id);
    if (!it) return;
    Object.assign(it, patch);
    render();
    void post({ item: id, state: it.state, answer: it.answer, note: it.note });
  }

  const handlers = {
    answer: (id: string, choice: string) => setItem(id, { state: "answered", answer: [choice] }),
    seen: (id: string) => setItem(id, { state: "seen" }),
    hide: (id: string) => setItem(id, { state: "hidden" }),
    open: (id: string) => {
      const it = topic?.items.find(x => x.id === id);
      if (!it || !topic) return;
      if (it.view === "drawer") return openDrawer(it);
      setItem(id, { state: "open" });
    },
  };

  function render() {
    const live = topic?.state === "open" ? topic : null;
    // 開いているドロワーの問いが終わった（答えた・話題が終わった）ら閉じる
    const showing = drawer.showing();
    if (showing && !live?.items.some(it => it.id === showing && !done(it))) drawer.close();
    for (const b of ctx.books()) {
      if (!b.loaded) continue;
      const items: BubbleItem[] = live && live.doc === b.id
        ? live.items.filter(it => !done(it)).map(it => ({ id: it.id, box: it.box, text: it.text, choices: it.choices, letter: it.letter, view: it.view, state: folded(it) ? "hidden" as const : "open" as const }))
        : [];
      b.graph.askBubbles("ask", items, handlers);
    }
    // パレット（タブ行の真ん中）。話題が開いていて、そのブックを見ているときだけ
    const shown = live && ctx.current()?.book.id === live.doc;
    ctx.palette.hidden = !shown;
    if (!shown || !live) { ctx.palette.innerHTML = ""; return; }
    const count = live.items.filter(done).length;
    ctx.palette.innerHTML = `<span class="ask-label">${esc(t("AI の問い"))}</span><span class="ask-count">${count} / ${live.items.length}</span>` +
      live.items.map(it => `<button type="button" data-ask="${esc(it.id)}" class="${done(it) ? "ask-done" : ""}${it.view === "drawer" ? " ask-drawer" : ""}"
        title="${esc(it.text || (it.choices ?? []).join(" / "))}">${esc(it.letter ?? t("見る"))}</button>`).join("");
  }

  // パレットを押した: その問いのページへ移ってスクロールし、隠していれば開く（ドロワーの問いはドロワーを開く）
  ctx.palette.addEventListener("click", e => {
    const id = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-ask]")?.dataset.ask : undefined;
    const it = id ? topic?.items.find(x => x.id === id) : undefined;
    const b = topic ? ctx.books().find(x => x.id === topic!.doc) : undefined;
    if (!it || !b || !topic) return;
    ctx.activate(b, page);
    try { b.graph.reveal(it.box); } catch { /* 箱が消えた */ }
    if (done(it)) return;
    if (it.view === "drawer") openDrawer(it);
    else if (folded(it)) setItem(it.id, { state: "open" });
  });

  // matomezu ask: 話題を出す
  async function answer(req: string, doc: string, focus = false) {
    const send = (state: string, error?: string) => void fetch(`api/point/${encodeURIComponent(req)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, error }),
    }).catch(() => {});
    if (ctx.focusWaiting()) return send("pending");
    if (ctx.busy()) return send("busy");
    await refresh();
    if (!topic || topic.doc !== doc) return send("error", "the topic is gone");
    const b = await ctx.openBook(doc);
    if (!b) return send("error", "the diagram could not be opened in the browser");
    const nodes = nodesOf(b);
    const missing = topic.items.filter(it => !nodes.some(n => String(n.id) === it.box)).map(it => it.box);
    if (missing.length) return send("error", `no box ${missing.join(", ")} in this diagram (removed boxes can't be asked about)`);
    const pages = new Set(topic.items.map(it => pageOf(nodes, it.box)));
    if (pages.size > 1) return send("error", "the boxes are on different pages; ask about one page at a time");
    page = [...pages][0] ?? null;
    if (ctx.current()?.book === b) {
      ctx.activate(b, page);
      render();
      if (focus) ctx.frame(b, topic.items[0]!.box);
      else try { b.graph.reveal(topic.items[0]!.box); } catch { /* 無い箱は上で断った */ }
      return send("shown");
    }
    // ほかのブック: 移るかを確かめる（答えはサーバーへ。キャンセルなら話題は declined のまま、AI が終わらせる）
    const name = ctx.title(b);
    let moved = false;
    const overlay = openSimpleDialog(t("AI の問い"), t("移動"),
      `<p class="mz-dlg-message">${esc(t("ブック「{book}」の箱について、AI が {n} 件の問いを出しています。移動しますか？", { book: name, n: topic.items.length }))}</p>`,
      () => {
        moved = true;
        if (topic) topic.state = "open";
        void post({ state: "open" });
        ctx.activate(b, page);
        render();
        if (focus) ctx.frame(b, topic!.items[0]!.box);
        else try { b.graph.reveal(topic!.items[0]!.box); } catch { /* 箱が消えた */ }
      });
    const watch = new MutationObserver(() => {
      if (overlay.isConnected) return;
      watch.disconnect();
      if (!moved) void post({ state: "declined" });
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return send("asked");
  }

  // ブックを閉じた: そのブックの話題は終わり（AI が -status で知る）
  function bookClosed(id: string) {
    if (topic?.doc === id && (topic.state === "open" || topic.state === "asking")) {
      topic.state = "closed";
      void post({ state: "closed" });
    }
    render();
  }

  // 話題が開いているか（フォーカスを出さない）
  const open = () => !!topic && topic.state !== "declined" && topic.state !== "closed";

  return { refresh, answer, render, bookClosed, open, topic: () => topic, setItem };
}
