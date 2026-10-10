/*
 * ボックスの編集ダイアログ（キャプションと本文。docs/BODY-plan.md の段階 3）。
 * モーダル: 画面全体を覆い、閉じるまで図やサイドバーを触れなくする。入力中は図を動かさず、確定したときに 1 件の履歴として書く。
 * Ctrl+Enter（Mac は Cmd+Enter）か「確定」で確定、Esc か「取り消し」で閉じる。キャプションの欄では Enter でも確定する（1 行）。
 *
 *   openEditDialog(graph, id); // 箱のダブルクリックと、サイドバーの鉛筆ボタンから開く
 *   closeEditDialog();         // 開いていれば閉じる（図を作り直すときなど）
 */

import { esc, injectStyle } from "./dom";
import type { Graph } from "./graph";
import type { BoxInfo, Patch } from "./types";

const STYLE_ID = "matomezu-edit-dialog-style";
const CSS = `
.mz-dlg-overlay {
  position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.45); padding: 16px;
}
.mz-dlg {
  --dlg-control: #3a3a3f; --dlg-line: rgba(255, 255, 255, 0.14); --dlg-accent: #8b6cf0; --dlg-muted: rgba(244, 244, 245, 0.6);
  width: min(560px, 100%); max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box;
  color: #f4f4f5; background: #2e2e34; border: 1px solid var(--dlg-line); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45); padding: 18px 20px; font-size: 13px; line-height: 1.5;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-dlg {
    --dlg-control: #ececf0; --dlg-line: rgba(0, 0, 0, 0.12); --dlg-accent: #6d4bd8; --dlg-muted: rgba(27, 27, 31, 0.6);
    color: #1b1b1f; background: #ffffff;
  }
}
.mz-dlg h2 { margin: 0 0 12px; font-size: 15px; }
.mz-dlg-field { display: block; margin-bottom: 12px; }
.mz-dlg-field > span { display: block; margin-bottom: 4px; font-weight: 600; }
.mz-dlg-input {
  width: 100%; box-sizing: border-box; font: inherit; color: inherit; background: var(--dlg-control);
  border: 1px solid var(--dlg-line); border-radius: 6px; padding: 6px 8px;
}
.mz-dlg-input:focus { outline: 2px solid var(--dlg-accent); outline-offset: -1px; }
textarea.mz-dlg-input { min-height: 160px; resize: vertical; line-height: 1.5; }
.mz-dlg-input:disabled { opacity: 0.5; }
.mz-dlg-check { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.mz-dlg-note { margin: -6px 0 12px; color: var(--dlg-muted); font-size: 12px; }
.mz-dlg-foot { display: flex; align-items: center; gap: 8px; }
.mz-dlg-hint { flex: 1; color: var(--dlg-muted); font-size: 12px; }
.mz-dlg-btn { font: inherit; color: inherit; background: var(--dlg-control); border: 0; border-radius: 6px; padding: 6px 14px; cursor: pointer; }
.mz-dlg-btn.mz-dlg-ok { color: #fff; background: var(--dlg-accent); }
`;

let open: { overlay: HTMLElement; back: Element | null } | null = null;

export function closeEditDialog(): void {
  if (!open) return;
  const { overlay, back } = open;
  open = null;
  overlay.remove();
  if (back instanceof HTMLElement) back.focus();
}

export function openEditDialog(graph: Graph, id: string): void {
  closeEditDialog();
  const info = graph.info(id);
  if (info.kind === "world") return;
  injectStyle(STYLE_ID, CSS);
  const b = info as BoxInfo;
  const overlay = document.createElement("div");
  overlay.className = "mz-dlg-overlay";
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  overlay.innerHTML = `<div class="mz-dlg" role="dialog" aria-modal="true" aria-labelledby="mz-dlg-title">
      <h2 id="mz-dlg-title">ボックスの編集</h2>
      <label class="mz-dlg-field"><span>キャプション</span>
        <input class="mz-dlg-input" type="text" name="caption" value="${esc(b.caption)}" placeholder="なし（空の箱）"></label>
      <label class="mz-dlg-field"><span>本文</span>
        <textarea class="mz-dlg-input" name="body" placeholder="なし"${b.canBody ? "" : " disabled"}>${esc(b.body)}</textarea></label>
      ${b.canBody ? "" : `<p class="mz-dlg-note">本文は、形がボックスで S 以外のサイズのときに出せます</p>`}
      <label class="mz-dlg-check"><input type="checkbox" name="rule"${b.bodyRule ? " checked" : ""}${b.canBody ? "" : " disabled"}>キャプションと本文の間に線を引く</label>
      <div class="mz-dlg-foot">
        <span class="mz-dlg-hint">${mac ? "⌘" : "Ctrl"}+Enter で確定 / Esc で取り消し</span>
        <button type="button" class="mz-dlg-btn" data-cancel>取り消し</button>
        <button type="button" class="mz-dlg-btn mz-dlg-ok" data-ok>確定</button>
      </div>
    </div>`;
  const field = <T extends HTMLElement>(name: string) => overlay.querySelector<T>(`[name="${name}"]`)!;
  const caption = field<HTMLInputElement>("caption"), body = field<HTMLTextAreaElement>("body"), rule = field<HTMLInputElement>("rule");

  // 変えた項目だけを 1 回の変更として書く（変えていなければ書かない。履歴に残さない）
  const commit = () => {
    const patch: Patch = {};
    if (caption.value !== b.caption) patch.caption = caption.value;
    if (b.canBody && body.value !== b.body) patch.body = body.value || null;
    if (b.canBody && rule.checked !== b.bodyRule) patch.bodyRule = rule.checked ? null : false;
    closeEditDialog();
    if (Object.keys(patch).length) graph.update(id, patch);
  };

  overlay.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest("[data-ok]")) commit();
    else if (t?.closest("[data-cancel]")) closeEditDialog();
  });
  // キー操作はダイアログの中で止める（図の Undo や Esc の操作に届かないように）
  overlay.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); closeEditDialog(); return; }
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.target === caption) { e.preventDefault(); commit(); }
  });
  // 後ろの図やページへ、ポインタの操作も届かせない（オーバーレイの上で受け止める）
  for (const type of ["pointerdown", "pointerup", "dblclick", "wheel"] as const) {
    overlay.addEventListener(type, e => e.stopPropagation());
  }
  // Tab で後ろの要素へ移らないよう、ダイアログの中を巡らせる
  overlay.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const items = [...overlay.querySelectorAll<HTMLElement>("input:not(:disabled), textarea:not(:disabled), button")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
    e.preventDefault();
    items[next]?.focus();
  });

  open = { overlay, back: document.activeElement };
  document.body.appendChild(overlay);
  caption.focus();
  caption.select();
}

export const editDialogOpen = (): boolean => open != null;
