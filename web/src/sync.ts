/*
 * matomezu serve と画面の同期（図 1 つ分。アプリ内のタブ 1 つに 1 つ）。
 * - 画面での変更は、少し待ってまとめて保存する（If-Match に読み込んだときの版を付ける）。
 * - ファイルが外部（LLM など）で変わったら、サーバーの通知（events.ts が受けて notify で渡す）で知り、読み直す。
 *   外部の変更を優先する。
 * - ドラッグ中や保存中に届いた変更は、それが終わってから読み直す。
 * - 読み直したデータが不正なときは表示を残し、直るまで保存を止める（書きかけのファイルを上書きしないため）。
 * - 外部の変更はユーザーの Undo の履歴には積まない。ユーザーが見たときにユーザーの履歴へ差し込む（D31。graph.ts の load の version）。
 * - 見ていないタブ（active でない）では読み直さず、前に出たときに読み直す。隠れた画面では文字の幅を測れず、配置が壊れるため。
 * - 配置の要約（matomezu check）は送らない。check はカレントの画面に直接頼む（app-answers.ts の answerSummary、internal/server/summary.go。D30）
 */

import { formatDiagram } from "./format";
import { t } from "./i18n";
import type { Graph } from "./graph";
import type { Diagram } from "./types";

const SAVE_DELAY = 300;

export interface SyncUi {
  status(text: string): void;   // 保存中・保存しました などの、出さなくてよい知らせ（D26 で画面には出していない）
  notice?(text: string): void;  // 気づいてほしい知らせ（画面の変更を取り消して読み直す。トーストで出す）
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
  // 画面が表示している版（引用符なし。まだ表示していなければ ""）
  shown(): string;
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



  function apply(r: Remote, keepHistory: boolean) {
    version = r.version;
    remote = r.version;
    try {
      if (r.data instanceof Error) throw r.data;
      const sel = graph.selected();
      graph.load(r.data, { keepHistory, version: r.version });
      if (sel != null) {
        try { graph.select(sel); } catch { /* 消えたボックスは選び直さない */ }
      }
      blocked = false;
      ui.clearError();
      return true;
    } catch (err) {
      blocked = true;
      ui.error(t("ファイルを読み込めません（直るまで保存を止めています）: {error}", { error: err instanceof Error ? err.message : String(err) }));
      return false;
    }
  }

  async function reload() {
    if (timer) { clearTimeout(timer); timer = null; } // 外部の変更を優先し、保存待ちは捨てる
    loading = true;
    try {
      const r = await fetchRemote(base);
      if (!r) {
        ui.error(t("サーバーに接続できません"));
        return;
      }
      if (apply(r, true)) ui.status(t("外部の変更を読み込みました"));
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
    ui.status(t("保存中…"));
    try {
      const res = await fetch(base + "api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": version },
        body: formatDiagram(graph.toJSON()),
      });
      const etag = res.headers.get("ETag");
      if (res.ok && etag) {
        version = etag;
        // 保存中に新しい版が届いていなければ、自分の保存による版を最新とみなす。
        // 届いていれば、それは自分の保存か、そのあとの外部の変更なので、そのまま比べる
        if (remote === prev) remote = etag;
        ui.status(t("保存しました"));
      } else if (res.status === 409) {
        if (etag) remote = etag;
        const text = t("外部で変更されていたため、画面の変更を取り消して読み直します");
        ui.status(text);
        ui.notice?.(text);
      } else {
        ui.error(t("保存できませんでした: {error}", { error: `${res.status} ${await res.text()}` }));
      }
    } catch (err) {
      ui.error(t("保存できませんでした: {error}", { error: err instanceof Error ? err.message : String(err) }));
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
      // 最初のデータを出しても、待っている間に知らされた新しい版は忘れない（apply は remote を出した版にするので戻す）。
      // 忘れると、裏のタブのファイルが変わってから前に出したとき、古いデータのまま読み直さなかった（2026-10-11）
      const latest = remote;
      apply(r, false);
      if (latest !== r.version) remote = latest;
    }
    maybeReload();
  }

  // ドラッグ中に届いた変更は、手を離してから反映する（graph のハンドラーより後に動くよう待つ）
  const onUp = () => setTimeout(maybeReload, 0);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);


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
    shown: () => version.replace(/^W\//, "").replace(/"/g, ""),
    close() {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (timer) clearTimeout(timer);
    },
  };
}
