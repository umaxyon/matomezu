// 画面の組み立て。ヘッダー、サイドバー、描画領域をつなぐ。
// - matomezu serve から開いたとき: ファイルを読み、自動で保存し、外部の変更を反映する。
// - それ以外（file:// や静的配信）: 埋め込みのサンプルか ?src= の JSON を表示し、開く・保存のボタンで扱う。

import { download, readFile } from "./dom";
import { createGraph } from "./graph";
import { createPanel, type Panel } from "./panel";
import { fetchRemote, startSync, type Sync } from "./sync";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $("stage");
const nameEl = $("name");
const statusEl = $("status");
const hint = $("hint");
const fileInput = $<HTMLInputElement>("file");
const defaultHint = hint.textContent ?? "";

function showError(err: unknown) {
  hint.textContent = err instanceof Error ? err.message : String(err);
  hint.classList.add("error");
}

function clearError() {
  hint.textContent = defaultHint;
  hint.classList.remove("error");
}

let statusTimer: ReturnType<typeof setTimeout> | null = null;
function showStatus(text: string) {
  statusEl.textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusEl.textContent = ""; }, 3000);
}

async function main() {
  const remote = await fetchRemote();
  let panel: Panel | null = null;
  let sync: Sync | null = null;
  const initial = remote ? { nodes: [] } : JSON.parse($("initial-data").textContent ?? "{}");
  const graph = createGraph(stage, initial, {
    onSelect: info => panel?.show(info),
    onChange: data => sync?.changed(data),
  });
  panel = createPanel($("sidebar"), graph);

  if (remote) {
    document.body.classList.add("served");
    nameEl.textContent = remote.name;
    document.title = `${remote.name} - matomezu`;
    sync = startSync(graph, remote, { status: showStatus, error: showError, clearError });
    return;
  }

  let fileName = "matomezu.json";
  function setLoaded(name: string) {
    fileName = name;
    nameEl.textContent = name;
    clearError();
  }

  async function openFile(file: File) {
    try {
      graph.load(await readFile(file));
      setLoaded(file.name);
    } catch (err) {
      showError("読み込めませんでした: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  $("save").addEventListener("click", () => download(graph.toJSON(), fileName));

  $("open").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) openFile(file);
    fileInput.value = "";
  });

  stage.addEventListener("dragover", e => { e.preventDefault(); stage.classList.add("dropping"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("dropping"));
  stage.addEventListener("drop", e => {
    e.preventDefault();
    stage.classList.remove("dropping");
    const file = e.dataTransfer?.files[0];
    if (file) openFile(file);
  });

  // ?src=xxx.json を付けて開くとそちらを読む（http で配信しているときのみ）
  const src = new URLSearchParams(location.search).get("src");
  if (src) {
    fetch(src)
      .then(r => { if (!r.ok) throw new Error(`${r.status} ${src}`); return r.json(); })
      .then(data => { graph.load(data); setLoaded(src.split("/").pop() ?? src); })
      .catch(err => showError("読み込めませんでした: " + (err instanceof Error ? err.message : String(err))));
  }
}

main();
