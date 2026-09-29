/*
 * サーバーの通知（/api/events、hub.go）を 1 本だけつなぎ、アプリ内の全部のタブに配る。
 * - server: 最初につないだときの版を覚え、つなぎ直したときに違えば画面ごと読み直す（作り直したサーバーの新しい JS にするため）。
 * - version: 図のファイルの版が変わった。
 * - open: その図（のページ）を開いて前に出すよう頼まれた（matomezu open / check / set）。
 * - 接続が切れても、つなぎ直しを続ける（入れ替わったサーバーが同じアドレスで起動するのを待つ）。
 */

export interface EventHandlers {
  version(doc: string, version: string): void;
  open(doc: string, page: string | null): void;
  status(text: string): void;
}

export interface EventOptions {
  url?: string;
  reload?: () => void;   // サーバーの版が変わったときに画面を読み直す（テストで差し替える）
  retryDelay?: number;   // 接続を諦めたときに、つなぎ直すまでの時間
}

export function connectEvents(h: EventHandlers, o: EventOptions = {}): () => void {
  const url = o.url ?? "api/events";
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

  function connect() {
    es = new EventSource(url);
    es.addEventListener("server", e => {
      const v = parse(e);
      if (server == null) server = v;
      else if (v !== server) reloadPage();
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

  return () => {
    closed = true;
    es.close();
    if (retryTimer) clearTimeout(retryTimer);
  };
}
