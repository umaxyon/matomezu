// 画面の組み立て。タブ行（道具・タブ・右端の群）、サイドバー、描画領域をつなぐ（D26 でヘッダーをやめた。docs/UI-plan.md）。
// - matomezu のサーバーから開いたとき: 図をアプリ内のタブとして開き、自動で保存し、外部の変更を反映する（app.ts）。
// - それ以外（file:// や静的配信）: 埋め込みのサンプルか ?src= の JSON を表示し、開く・保存のボタンで扱う（ボタンはタブ行の右に仮に置く。ファイルの扱いは別の課題）。
// - 知らせ: エラーは直るまで消えないトースト、断りはトースト（notices.ts）。開いている図が無いときは図の真ん中に案内を出す

import { startApp } from "./app";
import { openBookDialog } from "./book-dialog";
import { download, readFile } from "./dom";
import { setupMinimapToggle } from "./minimap";
import { handleGraphEvent } from "./notices";
import { lang, t, translateDom } from "./i18n";
import { setupPreview } from "./preview";
import { setupSettings } from "./settings";
import { setupHistory, setupModes } from "./toolbar";
import { setupContextMenu } from "./context-menu";
import { toast } from "./toast";
import { mountDiagram } from "./view";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// HTML に書いた文言を、選んだ言語にする（ほかの部品が文言を読む前に）
document.documentElement.lang = lang();
translateDom(document.body);

const stage = $("stage");
const nameEl = $("name").querySelector<HTMLElement>(".tab-name")!;
const emptyEl = $("empty");
const fileInput = $<HTMLInputElement>("file");

// エラーは 1 枚だけ出し、直る（clearError）まで消さない
let closeError: (() => void) | null = null;
function showError(err: unknown) {
  closeError?.();
  closeError = toast(err instanceof Error ? err.message : String(err), { kind: "error" });
}

function clearError() {
  closeError?.();
  closeError = null;
}

// サイドバーの出し入れ。追加削除の一覧（boxes）と郵便箱（mail）のどちらか 1 つを出す。同じボタンをもう一度押すと隠す。
// body の side-open と data-side を切り替え、変わったら知らせる
export type SideKind = "boxes" | "mail" | "cross"; // cross はマスターの追加削除（道具箱から出す。ボタンは無い）
export interface SideToggle { open(): SideKind | null; show(kind: SideKind | null): void; onChange(fn: (kind: SideKind | null) => void): void }
function setupSide(buttons: Partial<Record<SideKind, HTMLButtonElement>>): SideToggle {
  const listeners: ((kind: SideKind | null) => void)[] = [];
  let now: SideKind | null = null;
  const show = (kind: SideKind | null) => {
    if (kind === now) return;
    now = kind;
    document.body.classList.toggle("side-open", !!kind);
    if (kind) document.body.dataset.side = kind; else delete document.body.dataset.side;
    for (const [k, b] of Object.entries(buttons)) b!.setAttribute("aria-pressed", String(k === kind));
    for (const f of listeners) f(kind);
  };
  for (const [k, b] of Object.entries(buttons) as [SideKind, HTMLButtonElement][]) b.addEventListener("click", () => show(now === k ? null : k));
  return { open: () => now, show, onChange: fn => { listeners.push(fn); } };
}

// 図の真ん中の案内（null で隠す）
function showEmpty(text: string | null) {
  emptyEl.textContent = text ?? "";
  emptyEl.hidden = text == null;
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
  const side = setupSide({ boxes: $<HTMLButtonElement>("side-toggle"), mail: $<HTMLButtonElement>("mail-toggle") });
  setupSettings($("settings"));
  const preview = setupPreview({
    toggle: $("preview-toggle"), zoomOut: $("zoom-out"), zoomIn: $("zoom-in"), fit: $("zoom-fit"), home: $("zoom-home"), level: $("zoom-level"),
  });
  if (await served()) {
    document.body.classList.add("served");
    const canvas = stage.parentElement ?? document.body;
    stage.remove(); // 描画領域はタブごとに作る
    $("name").remove(); // 図の名前はブックのタブに出す
    startApp({
      tabs: $("tabs"), master: $<HTMLButtonElement>("master"), book: $<HTMLButtonElement>("book"), canvas, sidebar: $("sidebar"), side, mailbox: $("mailbox"), mailBadge: $("mail-badge"), crossList: $("crossmove"), askPalette: $("ask-palette"),
      undo: undoBtn, redo: redoBtn, modeButtons, modeLabel: $("mode-label"), preview,
      notice: text => toast(text), error: showError, clearError, empty: showEmpty,
    });
    return;
  }

  const initial = JSON.parse($("initial-data").textContent ?? "{}");
  const { graph, panel } = mountDiagram(stage, $("sidebar"), initial, {
    onHistory: h => {
      undoBtn.disabled = !h.canUndo;
      redoBtn.disabled = !h.canRedo;
    },
    onEvent: ev => handleGraphEvent(graph, ev),
  });
  setupHistory(graph, undoBtn, redoBtn);
  preview.attach(graph, stage);
  setupModes(graph, modeButtons, $("mode-label"));
  setupContextMenu(graph, stage, () => openBookDialog(graph, fileName));

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
      showError(t("読み込めませんでした: {error}", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  $("save").addEventListener("click", () => download(graph.toJSON(), fileName));
  $("book").addEventListener("click", () => openBookDialog(graph, fileName));
  side.onChange(kind => (kind === "boxes" ? panel.shown() : panel.hidden()));

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
      .catch(err => showError(t("読み込めませんでした: {error}", { error: err instanceof Error ? err.message : String(err) })));
  }
}

main();
