/*
 * matomezu serve と画面の同期（図 1 つ分。アプリ内のタブ 1 つに 1 つ）。
 * - 画面での変更は、少し待ってまとめて保存する（If-Match に読み込んだときの版を付ける）。
 * - ファイルが外部（LLM など）で変わったら、サーバーの通知（events.ts が受けて notify で渡す）で知り、読み直す。
 *   外部の変更を優先する。
 * - ドラッグ中や保存中に届いた変更は、それが終わってから読み直す。
 * - 読み直したデータが不正なときは表示を残し、直るまで保存を止める（書きかけのファイルを上書きしないため）。
 * - 外部の変更は履歴に1件として残す（Undo で取り消せる）。最初の読み込みでは履歴を空にする。
 * - 見ていないタブ（active でない）では読み直さず、前に出たときに読み直す。隠れた画面では文字の幅を測れず、配置が壊れるため。
 * - 見ているタブは、読み込みと保存のたび、表示領域の大きさが変わるたびに、配置の要約（report.ts）をその版と一緒に送る。
 *   LLM は matomezu check / set でそれを読み、図を調整する。
 */

import type { Graph } from "./graph";
import { summarize } from "./report";
import type { Diagram } from "./types";

const SAVE_DELAY = 300;
const RESIZE_DELAY = 300;

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

// 図ごとの API の場所（例 "d/<id>/"）。画面の URL からの相対
export const docBase = (id: string) => `d/${encodeURIComponent(id)}/`;

// サーバーから図を読む。サーバーが無いとき（file:// や静的配信）や、知らない図のときは null を返す
export async function fetchRemote(base: string): Promise<Remote | null> {
  let res: Response;
  try {
    res = await fetch(base + "api/data", { cache: "no-store" });
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
  // サーバーから知らされたファイルの版（引用符なし）
  notify(version: string): void;
  // 見ているタブか。前に出たら、届いていた変更を読み直し、配置の要約を送る
  setActive(active: boolean): void;
  // 配置の要約を送り直す（描くページを変えたときなど）
  report(): void;
  close(): void;
}

export function startSync(graph: Graph, base: string, first: Remote, ui: SyncUi, o: { active?: boolean } = {}): Sync {
  let active = o.active ?? true;
  let version = "";            // 画面が表示している版（まだ表示していなければ空）
  let remote = first.version;  // サーバーから知らされた最新の版
  let pending: Remote | null = first; // 前に出たら表示する、最初の読み込み
  let blocked = false;         // 表示と違う不正なファイルがあるので保存しない
  let saving = false;
  let loading = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 表示している版の配置の要約を送る。届かなくても図の操作には関係しないので、失敗は知らせない
  function report() {
    if (!active || !version || blocked) return;
    let summary: string;
    try {
      summary = summarize(graph.geometry());
    } catch {
      return;
    }
    fetch(base + "api/layout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: version.replace(/^W\//, "").replace(/"/g, ""), page: graph.page() ?? "", summary }),
    }).catch(() => {});
  }

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
      report();
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
      const r = await fetchRemote(base);
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
    if (!active || pending) return;
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
      const res = await fetch(base + "api/data", {
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
        report();
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

  function show() {
    if (pending) {
      const r = pending;
      pending = null;
      apply(r, false);
    } else {
      report();
    }
    maybeReload();
  }

  // ドラッグ中に届いた変更は、手を離してから反映する（graph のハンドラーより後に動くよう待つ）
  const onUp = () => setTimeout(maybeReload, 0);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  // 表示領域の大きさが変わると収まるかどうかも変わるので、落ち着いてから送り直す
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const onResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizeTimer = null; report(); }, RESIZE_DELAY);
  };
  window.addEventListener("resize", onResize);

  if (active) show();

  return {
    changed() {
      if (blocked) return;
      schedule();
    },
    notify(v) {
      remote = `"${v}"`;
      maybeReload();
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      if (active) show();
    },
    report,
    close() {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", onResize);
      if (timer) clearTimeout(timer);
      if (resizeTimer) clearTimeout(resizeTimer);
    },
  };
}
