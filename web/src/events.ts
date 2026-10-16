/*
 * サーバーの通知（/api/events、hub.go）を 1 本だけつなぎ、アプリ内の全部のタブに配る。
 * - server: 最初につないだときの版を覚え、つなぎ直したときに違えば画面ごと読み直す（作り直したサーバーの新しい JS にするため）。
 * - hello: この接続の id。開いている図（watched）を api/watch で知らせる。サーバーは開いている図だけを監視する。
 *   タブを開いたり閉じたりしたら watchChanged で知らせ直す（つなぎ直したときも、新しい id で知らせ直す）。
 *   画面がフォーカスされたとき（前に出たとき）も、この id で api/focus に知らせる。サーバーは最後にフォーカスされた画面をカレントとする
 *   （D30。docs/NOTIFY-plan.md）。つないだときに前にあれば、そのときも知らせる。
 * - version: 図のファイルの版が変わった。
 * - open: その図（のページ）を開いて前に出すよう頼まれた。
 * - notify: 通知（matomezu notify と、matomezu open の「届いています」の arrive。カレントの画面にだけ届く。D30。internal/server/notify.go）。
 * - close: その図のタブを閉じるよう頼まれた（matomezu close）。タブの × と同じに閉じる。
 * - mail: その図の郵便箱が変わった（届いた・読んだ・取り除いた。D26 の段階 3）。
 * - books: 登録したブックの一覧が変わった（登録した・ファイルが変わった・消えた。マスターを作り直す）。
 * - fit: 預けた中身が紙に収まるかを求められた（matomezu set。カレントの画面にだけ届く。D33）。答えは api/fit/<req> へ送る。
 * - ask / askchanged: AI の問いの話題を出すよう求められた・話題が変わった（matomezu ask。D36）。ask の答えは api/point/<req> へ送る。
 * - point: その図の箱を示すフォーカス枠を求められた（matomezu focus。カレントの画面にだけ届く。D37）。答えは api/point/<req> へ送る。
 * - summary: その図のページの配置の要約を求められた（matomezu check。カレントの画面にだけ届く。D30）。答えは api/summary/<req> へ送る。
 * - 接続が切れても、つなぎ直しを続ける（入れ替わったサーバーが同じアドレスで起動するのを待つ）。
 */

import { t } from "./i18n";

export interface EventHandlers {
  version(doc: string, version: string): void;
  open(doc: string, page: string | null): void;
  notify?(n: Notice): void;
  close?(doc: string): void;
  mail?(doc: string): void;
  books?(): void;
  summary?(req: string, doc: string, page: string, version: string): void; // page は "" なら最初のページ、version はそのときのファイルの版
  point?(req: string, doc: string | null, box: string | null, say: string): void; // say は枠と一緒に出す簡易メッセージ（D36）
  ask?(req: string, doc: string, focus: boolean): void; // AI の問いの話題を出す（matomezu ask。D36）。focus なら 1 つ目の箱に枠も出す（focus -button）
  askChanged?(): void;                  // 話題が変わった（GET api/ask で読み直す） // 箱を示す（doc・box が null なら出している枠を消す。matomezu focus。D37）
  fit?(req: string, doc: string): void; // 預けた中身（api/fit/{req}）が紙に収まるかを答える（matomezu set。D33）
  status(text: string): void;
  watched?(): string[]; // 開いている図の id
}

// 通知（D30）。book があればそのブック（page はページ、null は最初のページ）を開く動きを持つ。dialog ならダイアログも出す。
// arrive は matomezu open の「届いています」（題名と本文は画面が作る）。box は開いたらフォーカス枠で示す箱（matomezu focus -mail。D37）
export interface Notice { title: string; body: string; book: string | null; page: string | null; box: string | null; dialog: boolean; arrive: boolean }

export interface EventConnection {
  close(): void;
  watchChanged(): void; // 開いている図が変わった
}

export interface EventOptions {
  url?: string;
  watchUrl?: string;
  focusUrl?: string;
  reload?: () => void;   // サーバーの版が変わったときに画面を読み直す（テストで差し替える）
  retryDelay?: number;   // 接続を諦めたときに、つなぎ直すまでの時間
}

export function connectEvents(h: EventHandlers, o: EventOptions = {}): EventConnection {
  const url = o.url ?? "api/events";
  const watchUrl = o.watchUrl ?? "api/watch";
  const focusUrl = o.focusUrl ?? "api/focus";
  let client: string | null = null; // 今の接続の id
  const reloadPage = o.reload ?? (() => location.reload());
  const retryDelay = o.retryDelay ?? 1000;
  let server: string | null = null; // 最初につないだサーバーの版
  let es: EventSource;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const parse = (e: Event) => {
    try {
      return JSON.parse((e as MessageEvent<string>).data);
    } catch {
      return null;
    }
  };

  // 開いている図を知らせる。届かなくてもよい（つなぎ直したときに知らせ直す。知らせが無いあいだ、サーバーは全部を監視する）
  function sendWatched() {
    if (!client || !h.watched) return;
    fetch(watchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client, docs: h.watched() }),
    }).catch(() => {});
  }

  // この画面がフォーカスされた（前に出た）ことを、その時刻と一緒に知らせる。届かなくてもよい（次にフォーカスされたときに知らせ直す）。
  // 時刻は覚えておき、つなぎ直したとき（サーバーの入れ替えなど）にも送る。サーバーは時刻の一番新しい画面をカレントにするので、
  // つなぎ直しの瞬間にどの画面もフォーカスを持っていなくても、最後にフォーカスされた画面がカレントのまま残る（2026-10-15）
  // 時刻はタブごとの sessionStorage にも書く（サーバーの版が変わると画面は読み直すので、読み直しても残るように）
  const front = () => document.visibilityState === "visible" && document.hasFocus();
  const FOCUS_KEY = "matomezu-focused-at";
  const stored = (() => { try { return Number(sessionStorage.getItem(FOCUS_KEY)) || 0; } catch { return 0; } })();
  let focusedAt = front() ? Date.now() : stored; // 最後にフォーカスされた時刻（0 ならまだ）
  const remember = () => { try { sessionStorage.setItem(FOCUS_KEY, String(focusedAt)); } catch { /* 覚えられなくても動く */ } };
  remember();
  function sendFocus() {
    if (!client || !focusedAt) return;
    fetch(focusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client, at: focusedAt }),
    }).catch(() => {});
  }
  const onFocus = () => { focusedAt = Date.now(); remember(); sendFocus(); };
  const onVisible = () => { if (document.visibilityState === "visible") onFocus(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  function connect() {
    client = null;
    es = new EventSource(url);
    es.addEventListener("server", e => {
      const v = parse(e);
      if (server == null) server = v;
      else if (v !== server) reloadPage();
    });
    es.addEventListener("hello", e => {
      const v = parse(e);
      if (v && typeof v.client === "string") {
        client = v.client;
        sendWatched();
        h.askChanged?.(); // つないだ・つなぎ直した: 話題を読み直す（画面の読み直しで消えない）
        if (front()) { focusedAt = Date.now(); remember(); }
        sendFocus();
      }
    });
    es.addEventListener("version", e => {
      const v = parse(e);
      if (v && typeof v.doc === "string") h.version(v.doc, String(v.version));
    });
    es.addEventListener("open", e => {
      const v = parse(e);
      if (v && typeof v.doc === "string") h.open(v.doc, typeof v.page === "string" && v.page ? v.page : null);
    });
    es.addEventListener("notify", e => {
      const v = parse(e);
      if (!v || typeof v !== "object") return;
      const str = (x: unknown) => (typeof x === "string" ? x : "");
      h.notify?.({
        title: str(v.title), body: str(v.body), book: str(v.book) || null, page: str(v.page) || null, box: str(v.box) || null,
        dialog: v.dialog === "true", arrive: v.arrive === "true",
      });
    });
    es.addEventListener("close", e => {
      const v = parse(e);
      if (v && typeof v.doc === "string") h.close?.(v.doc);
    });
    es.addEventListener("mail", e => {
      const v = parse(e);
      if (v && typeof v.doc === "string") h.mail?.(v.doc);
    });
    es.addEventListener("books", () => h.books?.());
    es.addEventListener("fit", e => {
      const v = parse(e);
      if (v && typeof v.req === "string" && typeof v.doc === "string") h.fit?.(v.req, v.doc);
    });
    es.addEventListener("point", e => {
      const v = parse(e);
      if (v && typeof v.req === "string") h.point?.(v.req, typeof v.doc === "string" ? v.doc : null, typeof v.box === "string" ? v.box : null, typeof v.say === "string" ? v.say : "");
    });
    es.addEventListener("ask", e => {
      const v = parse(e);
      if (v && typeof v.req === "string" && typeof v.doc === "string") h.ask?.(v.req, v.doc, v.focus === "true");
    });
    es.addEventListener("askchanged", () => h.askChanged?.());
    es.addEventListener("summary", e => {
      const v = parse(e);
      if (v && typeof v.req === "string" && typeof v.doc === "string") h.summary?.(v.req, v.doc, String(v.page ?? ""), String(v.version ?? ""));
    });
    es.addEventListener("error", () => {
      h.status(t("再接続中…"));
      // EventSource は自分で再接続するが、諦めたら（サーバーが無い間の応答の失敗など）作り直して続ける
      if (es.readyState === EventSource.CLOSED && !closed) {
        es.close();
        retryTimer = setTimeout(() => { retryTimer = null; if (!closed) connect(); }, retryDelay);
      }
    });
  }
  connect();

  return {
    close() {
      closed = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      es.close();
      if (retryTimer) clearTimeout(retryTimer);
    },
    watchChanged: sendWatched,
  };
}
