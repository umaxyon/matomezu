/*
 * サーバーの通知（/api/events、hub.go）を 1 本だけつなぎ、アプリ内の全部のタブに配る。
 * - server: 最初につないだときの版を覚え、つなぎ直したときに違えば画面ごと読み直す（作り直したサーバーの新しい JS にするため）。
 * - hello: この接続の id。開いている図（watched）を api/watch で知らせる。サーバーは開いている図だけを監視する。
 *   タブを開いたり閉じたりしたら watchChanged で知らせ直す（つなぎ直したときも、新しい id で知らせ直す）。
 * - version: 図のファイルの版が変わった。
 * - open: その図（のページ）を開いて前に出すよう頼まれた（matomezu open / check / set）。
 * - 接続が切れても、つなぎ直しを続ける（入れ替わったサーバーが同じアドレスで起動するのを待つ）。
 */

export interface EventHandlers {
  version(doc: string, version: string): void;
  open(doc: string, page: string | null): void;
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
  reload?: () => void;   // サーバーの版が変わったときに画面を読み直す（テストで差し替える）
  retryDelay?: number;   // 接続を諦めたときに、つなぎ直すまでの時間
}

export function connectEvents(h: EventHandlers, o: EventOptions = {}): EventConnection {
  const url = o.url ?? "api/events";
  const watchUrl = o.watchUrl ?? "api/watch";
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
    es.addEventListener("error", () => {
      h.status("再接続中…");
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
      es.close();
      if (retryTimer) clearTimeout(retryTimer);
    },
    watchChanged: sendWatched,
  };
}
