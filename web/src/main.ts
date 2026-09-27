// 画面の組み立て。ヘッダー（JSON を開く・保存）、サイドバー、描画領域をつなぐ。

import { download, readFile } from "./dom";
import { createGraph } from "./graph";
import { createPanel, type Panel } from "./panel";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const stage = $("stage");
const nameEl = $("name");
const hint = $("hint");
const fileInput = $<HTMLInputElement>("file");
const defaultHint = hint.textContent ?? "";
let fileName = "matomezu.json";

function showError(err: unknown) {
  hint.textContent = "読み込めませんでした: " + (err instanceof Error ? err.message : String(err));
  hint.classList.add("error");
}

function setLoaded(name: string) {
  fileName = name;
  nameEl.textContent = name;
  hint.textContent = defaultHint;
  hint.classList.remove("error");
}

let panel: Panel | null = null;
const graph = createGraph(stage, JSON.parse($("initial-data").textContent ?? "{}"), {
  onSelect: info => panel?.show(info),
});
panel = createPanel($("sidebar"), graph);

async function openFile(file: File) {
  try {
    graph.load(await readFile(file));
    setLoaded(file.name);
  } catch (err) {
    showError(err);
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
    .catch(showError);
}
