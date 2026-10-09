// 画面の組み立て。ヘッダー、サイドバー、描画領域をつなぐ。
// - matomezu のサーバーから開いたとき: 図をアプリ内のタブとして開き、自動で保存し、外部の変更を反映する（app.ts）。
// - それ以外（file:// や静的配信）: 埋め込みのサンプルか ?src= の JSON を表示し、開く・保存のボタンで扱う。

import { startApp } from "./app";
import { download, readFile } from "./dom";
import { setupMinimapToggle } from "./minimap";
import { handleGraphEvent } from "./notices";
import { setupPreview } from "./preview";
import { setupHistory, setupModes } from "./toolbar";
import { mountDiagram } from "./view";

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

// matomezu のサーバーから開かれたか
async function served() {
  if (location.protocol === "file:") return false;
  try {
    const res = await fetch("api/info", { cache: "no-store" });
    return res.ok && typeof (await res.json()).server === "string";
  } catch {
    return false;
  }
}

async function main() {
  const undoBtn = $<HTMLButtonElement>("undo");
  const redoBtn = $<HTMLButtonElement>("redo");
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  setupMinimapToggle($<HTMLButtonElement>("minimap-toggle"));
  const preview = setupPreview({
    toggle: $("preview-toggle"), zoomOut: $("zoom-out"), zoomIn: $("zoom-in"), fit: $("zoom-fit"), level: $("zoom-level"),
  });
  if (await served()) {
    document.body.classList.add("served");
    const canvas = stage.parentElement ?? document.body;
    stage.remove(); // 描画領域はタブごとに作る
    const tabs = $("tabs");
    tabs.hidden = false;
    startApp({
      tabs, canvas, sidebar: $("sidebar"),
      undo: undoBtn, redo: redoBtn, modeButtons, modeLabel: $("mode-label"), preview,
      status: showStatus, error: showError, clearError,
      hint: text => { hint.textContent = text; hint.classList.remove("error"); },
    });
    return;
  }

  const initial = JSON.parse($("initial-data").textContent ?? "{}");
  const { graph } = mountDiagram(stage, $("sidebar"), initial, {
    onHistory: h => {
      undoBtn.disabled = !h.canUndo;
      redoBtn.disabled = !h.canRedo;
    },
    onEvent: ev => handleGraphEvent(graph, ev, showStatus),
  });
  setupHistory(graph, undoBtn, redoBtn);
  preview.attach(graph, stage);
  setupModes(graph, modeButtons, $("mode-label"));

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

  // JSON ファイルのドロップ（サイドバーの一覧から消したボックスを戻すドラッグは、図の側で受け取る）
  const carriesFile = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
  stage.addEventListener("dragover", e => { if (!carriesFile(e)) return; e.preventDefault(); stage.classList.add("dropping"); });
  stage.addEventListener("dragleave", () => stage.classList.remove("dropping"));
  stage.addEventListener("drop", e => {
    if (!carriesFile(e)) return;
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
