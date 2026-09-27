/*
 * matomezu serve と画面の同期。
 * - 画面での変更は、少し待ってまとめて保存する（If-Match に読み込んだときの版を付ける）。
 * - ファイルが外部（LLM など）で変わったら SSE で知り、読み直す。外部の変更を優先する。
 * - ドラッグ中や保存中に届いた変更は、それが終わってから読み直す。
 * - 読み直したデータが不正なときは表示を残し、直るまで保存を止める（書きかけのファイルを上書きしないため）。
 * - 外部の変更は履歴に1件として残す（Undo で取り消せる）。最初の読み込みでは履歴を空にする。
 */

import type { Graph } from "./graph";
import type { Diagram } from "./types";

const API = "api/data";
const EVENTS = "api/events";
const SAVE_DELAY = 300;

export interface SyncUi {
  status(text: string): void;
  error(message: string): void;
  clearError(): void;
}

export interface Remote {
  data: unknown;
  version: string;
  name: string;
}

// サーバーから図を読む。サーバー無しで開いたとき（file:// や静的配信）は null を返す
export async function fetchRemote(): Promise<Remote | null> {
  let res: Response;
  try {
    res = await fetch(API, { cache: "no-store" });
  } catch {
    return null;
  }
  const version = res.headers.get("ETag");
  if (!res.ok || !version) return null;
  const name = decodeURIComponent(res.headers.get("X-Matomezu-Name") ?? "");
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = err instanceof Error ? err : new Error(String(err)); // 読み込み側でエラーとして見せる
  }
  return { data, version, name };
}

export interface Sync {
  // 画面での変更を知らせる（createGraph の onChange から呼ぶ）
  changed(data: Diagram): void;
  close(): void;
}

export function startSync(graph: Graph, first: Remote, ui: SyncUi): Sync {
  let version = first.version; // 画面が表示している版
  let remote = first.version;  // サーバーから知らされた最新の版
  let blocked = false;         // 表示と違う不正なファイルがあるので保存しない
  let saving = false;
  let loading = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function apply(r: Remote, keepHistory: boolean) {
    version = r.version;
    remote = r.version;
    try {
      if (r.data instanceof Error) throw r.data;
      const sel = graph.selected();
      graph.load(r.data, { keepHistory });
      if (sel != null) {
        try { graph.select(sel); } catch { /* 消えたボックスは選び直さない */ }
      }
      blocked = false;
      ui.clearError();
      return true;
    } catch (err) {
      blocked = true;
      ui.error("ファイルを読み込めません（直るまで保存を止めています）: " + (err instanceof Error ? err.message : String(err)));
      return false;
    }
  }

  async function reload() {
    if (timer) { clearTimeout(timer); timer = null; } // 外部の変更を優先し、保存待ちは捨てる
    loading = true;
    try {
      const r = await fetchRemote();
      if (!r) {
        ui.error("サーバーに接続できません");
        return;
      }
      if (apply(r, true)) ui.status("外部の変更を読み込みました");
    } finally {
      loading = false;
    }
    maybeReload(); // 読んでいる間にさらに変わっていれば続けて読む
  }

  // 外部の変更が届いていて、今読み直してよいなら読み直す
  function maybeReload() {
    if (remote !== version && !saving && !loading && !graph.dragging()) reload();
  }

  async function save() {
    timer = null;
    if (blocked) return;
    if (saving || loading) { schedule(); return; }
    saving = true;
    const prev = version;
    ui.status("保存中…");
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": version },
        body: JSON.stringify(graph.toJSON(), null, 2) + "\n",
      });
      const etag = res.headers.get("ETag");
      if (res.ok && etag) {
        version = etag;
        // 保存中に新しい版が届いていなければ、自分の保存による版を最新とみなす。
        // 届いていれば、それは自分の保存か、そのあとの外部の変更なので、そのまま比べる
        if (remote === prev) remote = etag;
        ui.status("保存しました");
      } else if (res.status === 409) {
        if (etag) remote = etag;
        ui.status("外部で変更されていたため、画面の変更を取り消して読み直します");
      } else {
        ui.error(`保存できませんでした: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      ui.error("保存できませんでした: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      saving = false;
      maybeReload();
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  }

  const events = new EventSource(EVENTS);
  events.addEventListener("version", e => {
    remote = `"${(e as MessageEvent<string>).data}"`;
    maybeReload();
  });
  events.addEventListener("error", () => {
    // EventSource は自分で再接続する。つながり直すと最新の版が届く
    if (events.readyState === EventSource.CONNECTING) ui.status("再接続中…");
  });

  // ドラッグ中に届いた変更は、手を離してから反映する（graph のハンドラーより後に動くよう待つ）
  const onUp = () => setTimeout(maybeReload, 0);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  apply(first, false);

  return {
    changed() {
      if (blocked) return;
      schedule();
    },
    close() {
      events.close();
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (timer) clearTimeout(timer);
    },
  };
}
