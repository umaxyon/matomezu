// 右クリックのコンテキストメニュー（D42。2026-10-17 ユーザーと決めた最初の形）:
// - 出すのは箱と背景（ワールド）だけ。箱の上なら、その箱を選んでから出す。線の上・図の外（ミニマップなど）はブラウザの既定のまま
// - 項目はコピーと貼り付けだけ（Ctrl+C / Ctrl+V と同じ graph.copySelected / pasteClip）。背景で開いたら、右クリックした所に貼る
// - 使えない項目は消さずに灰色で出す。ショートカットを横に添える
// - 文字の入力欄の中と、文字を選んでいるときはブラウザの既定のメニューを残す
// - 出さないとき（Ctrl+C / Ctrl+V と同じ条件）: プレビュー中・ダイアログが開いている・ドラッグ中・選択と付け替え以外のモード。
//   説明ツアー中は幕が右クリックを止める（tour-view.ts）
// 項目は ITEMS に足せばよい形にしておく（線・タブなどへ広げるのと、パターンごとの出し分けは後で。D39・D25）
import type { Graph } from "./graph";
import { injectStyle } from "./dom";
import { t } from "./i18n";

const STYLE_ID = "matomezu-context-menu-style";
const CSS = `/* i18n-ok（CSS のコメント） */
.mz-cmenu {
  --cm-bg: #2e2e34; --cm-fg: #f4f4f5; --cm-line: rgba(255, 255, 255, 0.14); --cm-hover: rgba(139, 108, 240, 0.28); --cm-muted: rgba(244, 244, 245, 0.45);
  position: fixed; z-index: 950; min-width: 168px; box-sizing: border-box; padding: 4px; margin: 0; list-style: none;
  color: var(--cm-fg); background: var(--cm-bg); border: 1px solid var(--cm-line); border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); font-size: 13px; line-height: 1.4; user-select: none;
}
.mz-cmenu button {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 24px; width: 100%; padding: 6px 10px; border-radius: 5px; cursor: pointer;
}
.mz-cmenu button:hover:not(:disabled), .mz-cmenu button:focus-visible { background: var(--cm-hover); }
.mz-cmenu button:disabled { cursor: default; color: var(--cm-muted); }
.mz-cmenu-label { flex: 1; }
.mz-cmenu-key { color: var(--cm-muted); font-size: 12px; }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-cmenu { --cm-bg: #ffffff; --cm-fg: #1b1b1f; --cm-line: rgba(0, 0, 0, 0.12); --cm-hover: rgba(109, 75, 216, 0.14); --cm-muted: rgba(27, 27, 31, 0.4);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16); }
}
`;

interface Item {
  label: string;
  key: string;                                         // 横に添えるショートカットの文字（Ctrl+ / ⌘ の後ろ）
  enabled: (g: Graph) => boolean;
  run: (g: Graph, at: { x: number; y: number }) => void; // at は右クリックした所（画面の座標）
}

const ITEMS: Item[] = [
  { label: t("コピー"), key: "C", enabled: g => g.clipState().copy, run: g => { g.copySelected(); } },
  { label: t("貼り付け"), key: "V", enabled: g => g.clipState().paste, run: (g, at) => { g.pasteClip(at); } },
];

// 入力欄の中か（ブラウザの既定のメニューに譲る）
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);

// 図（stage）の右クリックにメニューを出す。登録を外す関数を返す（ブックを切り替えるときに外す）
export function setupContextMenu(graph: Graph, stage: HTMLElement): () => void {
  const listening = new AbortController();
  let menu: { el: HTMLElement; close: () => void } | null = null;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  stage.addEventListener("contextmenu", e => {
    menu?.close();
    if (typing(e.target) || !(window.getSelection()?.isCollapsed ?? true)) return;
    if (graph.preview() != null || graph.dragging() || document.querySelector(".mz-dlg-overlay")) return;
    if (graph.mode() !== "move" && graph.mode() !== "reparent") return;
    if (!graph.pickForMenu(e.target)) return;
    e.preventDefault();
    menu = open(graph, { x: e.clientX, y: e.clientY }, mac, () => { menu = null; });
  }, { signal: listening.signal });

  return () => {
    listening.abort();
    menu?.close();
  };
}

function open(graph: Graph, at: { x: number; y: number }, mac: boolean, closed: () => void): { el: HTMLElement; close: () => void } {
  injectStyle(STYLE_ID, CSS);
  const el = document.createElement("ul");
  el.className = "mz-cmenu";
  el.setAttribute("role", "menu");
  const stop = new AbortController();
  const { signal } = stop;
  const close = () => {
    if (signal.aborted) return;
    stop.abort();
    el.remove();
    closed();
  };
  for (const it of ITEMS) {
    const li = document.createElement("li");
    li.setAttribute("role", "none");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.disabled = !it.enabled(graph);
    const label = document.createElement("span");
    label.className = "mz-cmenu-label";
    label.textContent = it.label;
    const key = document.createElement("span");
    key.className = "mz-cmenu-key";
    key.textContent = mac ? `⌘${it.key}` : `Ctrl+${it.key}`;
    b.append(label, key);
    b.addEventListener("click", () => { close(); it.run(graph, at); }, { signal });
    li.appendChild(b);
    el.appendChild(li);
  }
  el.addEventListener("contextmenu", e => e.preventDefault(), { signal });
  document.body.appendChild(el);
  // 画面の端からはみ出すなら、内側へ寄せる
  const r = el.getBoundingClientRect(), margin = 4;
  el.style.left = `${Math.max(margin, Math.min(at.x, window.innerWidth - r.width - margin))}px`;
  el.style.top = `${Math.max(margin, Math.min(at.y, window.innerHeight - r.height - margin))}px`;

  // メニューの外を押す・Esc・スクロール・画面の大きさが変わる・ほかのウィンドウへ移ったら閉じる
  window.addEventListener("pointerdown", e => { if (!(e.target instanceof Node && el.contains(e.target))) close(); }, { signal, capture: true });
  window.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }, { signal, capture: true });
  window.addEventListener("wheel", close, { signal, capture: true, passive: true });
  window.addEventListener("scroll", close, { signal, capture: true, passive: true });
  window.addEventListener("resize", close, { signal });
  window.addEventListener("blur", close, { signal });
  return { el, close };
}
