/*
 * サーバーの通知（/api/events、hub.go）を 1 本だけつなぎ、アプリ内の全部のタブに配る。
 * - server: 最初につないだときの版を覚え、つなぎ直したときに違えば画面ごと読み直す（作り直したサーバーの新しい JS にするため）。
 * - hello: この接続の id。開いている図（watched）を api/watch で知らせる。サーバーは開いている図だけを監視する。
 *   タブを開いたり閉じたりしたら watchChanged で知らせ直す（つなぎ直したときも、新しい id で知らせ直す）。
 *   画面がフォーカスされたとき（前に出たとき）も、この id で api/focus に知らせる。サーバーは最後にフォーカスされた画面をカレントとする
 *   （D30。docs/NOTIFY-plan.md）。つないだときに前にあれば、そのときも知らせる。
 * - version: 図のファイルの版が変わった。
 * - open: その図（のページ）を開いて前に出すよう頼まれた（matomezu open。ask なら郵便箱に入れて聞く）。
 * - close: その図のタブを閉じるよう頼まれた（matomezu close）。タブの × と同じに閉じる。
 * - mail: その図の郵便箱が変わった（届いた・読んだ・取り除いた。D26 の段階 3）。
 * - books: 登録したブックの一覧が変わった（登録した・ファイルが変わった・消えた。マスターを作り直す）。
 * - summary: その図のページの配置の要約を求められた（matomezu check。カレントの画面にだけ届く。D30）。答えは api/summary/<req> へ送る。
 * - 接続が切れても、つなぎ直しを続ける（入れ替わったサーバーが同じアドレスで起動するのを待つ）。
 */

import { t } from "./i18n";

export interface EventHandlers {
  version(doc: string, version: string): void;
  open(doc: string, page: string | null, ask: boolean): void; // ask は matomezu open（すぐ切り替えず、郵便箱に入れて聞く。D26 の段階 3）
  close?(doc: string): void;
  mail?(doc: string): void;
  books?(): void;
  summary?(req: string, doc: string, page: string, version: string): void; // page は "" なら最初のページ、version はそのときのファイルの版
  status(text: string): void;
  watched?(): string[]; // 開いている図の id
}

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

  // この画面がフォーカスされた（前に出た）ことを知らせる。届かなくてもよい（次にフォーカスされたときに知らせ直す）
  function sendFocus() {
    if (!client) return;
    fetch(focusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client }),
    }).catch(() => {});
  }
  const front = () => document.visibilityState === "visible" && document.hasFocus();
  const onVisible = () => { if (document.visibilityState === "visible") sendFocus(); };
  window.addEventListener("focus", sendFocus);
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
        if (front()) sendFocus();
      }
    });
    es.addEventListener("version", e => {
      const v = parse(e);
      if (v && typeof v.doc === "string") h.version(v.doc, String(v.version));
    });
    es.addEventListener("open", e => {
      const v = parse(e);
      if (v && typeof v.doc === "string") h.open(v.doc, typeof v.page === "string" && v.page ? v.page : null, v.ask === "true");
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
      window.removeEventListener("focus", sendFocus);
      document.removeEventListener("visibilitychange", onVisible);
      es.close();
      if (retryTimer) clearTimeout(retryTimer);
    },
    watchChanged: sendWatched,
  };
}
