/*
 * 編集ダイアログ（箱はキャプションと本文、線はキャプション。docs/BODY-plan.md の段階 3）と、箱の追加のダイアログ（docs/ADD-plan.md）。
 * モーダル: 画面全体を覆い、閉じるまで図やサイドバーを触れなくする。入力中は図を動かさず、確定したときに 1 件の履歴として書く。
 * Ctrl+Enter（Mac は Cmd+Enter）か「確定」（追加は「追加」）で確定、Esc か「キャンセル」で閉じる。キャプションの欄では Enter でも確定する（1 行）。
 *
 *   openEditDialog(graph, id);     // 箱。ダブルクリックと、サイドバーの鉛筆ボタンから開く
 *   openAddDialog(graph, req);     // 箱の追加。追加モードで図を押したときに開く（req は押した所）
 *   openEdgeEditDialog(graph, id); // 線。線（か札）のダブルクリックと、サイドバーの鉛筆ボタンから開く
 *   closeEditDialog();             // 開いていれば閉じる（図を作り直すときなど）
 */

import { esc, injectStyle } from "./dom";
import { helpIcon, setupHelp } from "./help";
import type { Graph } from "./graph";
import type { AddRequest } from "./interaction";
import type { BoxData, BoxInfo, Patch } from "./types";

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
/* 本文の欄と、その下の本文の設定（箱の幅に合わせる・最大行数）の行は詰めて、ひとまとまりに見せる */
.mz-dlg-field.mz-dlg-body { margin-bottom: 4px; }
.mz-dlg-input {
  width: 100%; box-sizing: border-box; font: inherit; color: inherit; background: var(--dlg-control);
  border: 1px solid var(--dlg-line); border-radius: 6px; padding: 6px 8px;
}
.mz-dlg-input:focus { outline: 2px solid var(--dlg-accent); outline-offset: -1px; }
textarea.mz-dlg-input { display: block; min-height: 160px; resize: vertical; line-height: 1.5; }
.mz-dlg-input:disabled { opacity: 0.5; }
.mz-dlg-check { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.mz-dlg-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.mz-dlg-row > span { font-weight: 600; }
select.mz-dlg-input { width: auto; }
.mz-dlg-note { margin: -6px 0 12px; color: var(--dlg-muted); font-size: 12px; }
.mz-dlg-foot { display: flex; align-items: center; gap: 8px; margin-top: 28px; }
.mz-dlg-hint { flex: 1; color: var(--dlg-muted); font-size: 12px; }
.mz-dlg-btn { font: inherit; color: inherit; background: var(--dlg-control); border: 0; border-radius: 6px; padding: 6px 14px; cursor: pointer; }
.mz-dlg-btn.mz-dlg-ok { color: #fff; background: var(--dlg-accent); }
.mz-dlg-btn:disabled { opacity: 0.45; cursor: default; }
.mz-dlg-switch {
  position: relative; flex: none; width: 36px; height: 20px; padding: 0; border: 0; border-radius: 10px;
  background: var(--dlg-control); box-shadow: inset 0 0 0 1px var(--dlg-line); cursor: pointer; transition: background 0.15s;
}
.mz-dlg-switch::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: left 0.15s;
}
.mz-dlg-switch[aria-checked="true"] { background: var(--dlg-accent); box-shadow: none; }
.mz-dlg-switch[aria-checked="true"]::after { left: 19px; }
.mz-dlg-switch:disabled { opacity: 0.45; cursor: default; }
.mz-dlg-switch:focus-visible { outline: 2px solid var(--dlg-accent); outline-offset: 2px; }
.mz-dlg-onoff { min-width: 3em; color: var(--dlg-muted); font-size: 12px; }
.mz-dlg-lines { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.mz-dlg-lines .mz-help { margin-left: -2px; }
`;

let open: { overlay: HTMLElement; back: Element | null; unhelp: () => void } | null = null;

export function closeEditDialog(): void {
  if (!open) return;
  const { overlay, back, unhelp } = open;
  open = null;
  unhelp();
  overlay.remove();
  if (back instanceof HTMLElement) back.focus();
}

// 本文の最大行数の選択肢（超えた分は … で切る）。データにこれ以外の値があれば、それも選べるように足す
const LINE_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];

// 箱の中身（キャプション・区切り線・本文・箱の幅に合わせる・最大行数）を聞くダイアログ。編集と追加で同じ並び
interface BoxValues { caption: string; body: string; rule: boolean; lines: number | null; widthAuto: boolean }
type BoxStart = Pick<BoxInfo, "caption" | "body" | "bodyRule" | "bodyLines" | "bodyWidth" | "canBody">;

function boxDialog(title: string, okLabel: string, b: BoxStart, commit: (v: BoxValues) => void) {
  const lines = [...new Set([...LINE_CHOICES, ...(b.bodyLines ? [b.bodyLines] : [])])].sort((x, y) => x - y);
  const off = b.canBody ? "" : " disabled";
  // 区切り線（キャプションと本文の間の線）は、押すたびに入り切りするスイッチ。本文が空のあいだは切って押せなくし、
  // 本文を書き始めたら押せるようにして入れる
  // 「箱の幅に合わせる」は、つまみで本文の幅を変えていれば押せる。内包・リストの箱では本文が箱の幅いっぱいに戻り、
  // 子の無い箱では箱の幅が中身（キャプションと本文）に合わせて決まり直す
  const overlay = show(title, okLabel, `
      <label class="mz-dlg-field"><span>キャプション</span>
        <input class="mz-dlg-input" type="text" name="caption" value="${esc(b.caption)}" placeholder="なし（空の箱）"></label>
      <div class="mz-dlg-row"><span>区切り線</span>
        <button type="button" class="mz-dlg-switch" role="switch" name="rule" aria-checked="false" aria-label="区切り線" disabled></button>
        <span class="mz-dlg-onoff">OFF</span></div>
      <label class="mz-dlg-field mz-dlg-body"><span>本文</span>
        <textarea class="mz-dlg-input" name="body" placeholder="なし"${off}>${esc(b.body)}</textarea></label>
      ${b.canBody ? "" : `<p class="mz-dlg-note">本文は、形がボックスで S 以外のサイズ、キャプションを 1 行にしていないときに出せます</p>`}
      <div class="mz-dlg-row">
        <button type="button" class="mz-dlg-btn" data-width-auto${b.bodyWidth && b.canBody ? "" : " disabled"}>箱の幅に合わせる</button>
        <input type="hidden" name="width-auto" value="">
        <label class="mz-dlg-lines">最大行数${helpIcon("超えた分は … で切ります")}
          <select class="mz-dlg-input" name="lines"${off}>
            <option value=""${b.bodyLines ? "" : " selected"}>制限なし</option>
            ${lines.map(v => `<option value="${v}"${v === b.bodyLines ? " selected" : ""}>${v} 行</option>`).join("")}
          </select></label></div>`,
  overlay => {
    const field = <T extends HTMLElement>(name: string) => overlay.querySelector<T>(`[name="${name}"]`)!;
    const linesValue = field<HTMLSelectElement>("lines").value;
    commit({
      caption: field<HTMLInputElement>("caption").value,
      body: field<HTMLTextAreaElement>("body").value,
      rule: field("rule").getAttribute("aria-checked") === "true",
      lines: linesValue ? Number(linesValue) : null,
      widthAuto: !!field<HTMLInputElement>("width-auto").value,
    });
  });
  const ruleSwitch = overlay.querySelector<HTMLButtonElement>('[name="rule"]')!;
  const setRule = (on: boolean) => {
    ruleSwitch.setAttribute("aria-checked", String(on));
    ruleSwitch.nextElementSibling!.textContent = on ? "ON" : "OFF";
  };
  ruleSwitch.addEventListener("click", () => setRule(ruleSwitch.getAttribute("aria-checked") !== "true"));
  const bodyField = overlay.querySelector<HTMLTextAreaElement>('[name="body"]')!;
  const syncRule = (start: boolean) => {
    const has = b.canBody && bodyField.value !== "";
    if (has && ruleSwitch.disabled) setRule(start ? b.bodyRule : true);
    if (!has) setRule(false);
    ruleSwitch.disabled = !has;
  };
  syncRule(true);
  bodyField.addEventListener("input", () => syncRule(false));
  // 「箱の幅に合わせる」は確定したときに書く（押したらボタンを押せなくして、押したことを示す）
  overlay.querySelector<HTMLElement>("[data-width-auto]")!.addEventListener("click", e => {
    overlay.querySelector<HTMLInputElement>('[name="width-auto"]')!.value = "1";
    (e.currentTarget as HTMLButtonElement).disabled = true;
  });
  // 選んでいる行数は値で決める（option の selected だけに頼らない）
  overlay.querySelector<HTMLSelectElement>('[name="lines"]')!.value = b.bodyLines ? String(b.bodyLines) : "";
}

export function openEditDialog(graph: Graph, id: string): void {
  const info = graph.info(id);
  if (info.kind === "world") return;
  const b = info as BoxInfo;
  boxDialog("ボックスの編集", "確定", b, v => {
    const patch: Patch = {};
    if (v.caption !== b.caption) patch.caption = v.caption;
    if (b.canBody && v.body !== b.body) patch.body = v.body || null;
    if (b.canBody && v.body && v.rule !== b.bodyRule) patch.bodyRule = v.rule ? null : false; // 本文が無ければ区切り線は変えない
    if (b.canBody && v.lines !== b.bodyLines) patch.bodyLines = v.lines;
    if (b.bodyWidth && v.widthAuto) patch.bodyWidth = null;
    if (Object.keys(patch).length) graph.update(id, patch);
  });
}

// 追加モードで押した所 req に、新しい箱を足すダイアログ（docs/ADD-plan.md）。「追加」で足して選択モードに戻る。
// 「キャンセル」なら何もせず、追加モードのまま
export function openAddDialog(graph: Graph, req: AddRequest): void {
  const start: BoxStart = { caption: "", body: "", bodyRule: true, bodyLines: null, bodyWidth: null, canBody: true };
  boxDialog("ボックスの追加", "追加", start, v => {
    const fields: Partial<BoxData> = {};
    if (v.caption) fields.caption = v.caption;
    if (v.body) fields.body = v.body;
    if (v.body && !v.rule) fields.bodyRule = false;
    if (v.lines) fields.bodyLines = v.lines;
    graph.add(req, fields);
    graph.setMode("move");
  });
}

export function openEdgeEditDialog(graph: Graph, id: string): void {
  const e = graph.edgeInfo(id);
  if (!e) return;
  show("線の編集", "確定", `
      <label class="mz-dlg-field"><span>キャプション</span>
        <input class="mz-dlg-input" type="text" name="caption" value="${esc(e.caption ?? "")}" placeholder="なし"></label>`,
  overlay => {
    const caption = overlay.querySelector<HTMLInputElement>('[name="caption"]')!.value;
    if (caption.trim() !== (e.caption ?? "")) graph.updateEdge(id, { caption });
  });
}

// ダイアログを出す。fields は項目の HTML、commit は確定したときに項目を読んで書く（変えた項目だけを 1 回の変更として書く。
// 変えていなければ書かない。履歴に残さない）
function show(title: string, okLabel: string, fields: string, commit: (overlay: HTMLElement) => void): HTMLElement {
  closeEditDialog();
  injectStyle(STYLE_ID, CSS);
  const overlay = document.createElement("div");
  overlay.className = "mz-dlg-overlay";
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  overlay.innerHTML = `<div class="mz-dlg" role="dialog" aria-modal="true" aria-labelledby="mz-dlg-title">
      <h2 id="mz-dlg-title">${esc(title)}</h2>
      ${fields}
      <div class="mz-dlg-foot">
        <span class="mz-dlg-hint">${mac ? "⌘" : "Ctrl"}+Enter で${esc(okLabel)} / Esc でキャンセル</span>
        <button type="button" class="mz-dlg-btn" data-cancel>キャンセル</button>
        <button type="button" class="mz-dlg-btn mz-dlg-ok" data-ok>${esc(okLabel)}</button>
      </div>
    </div>`;
  const caption = overlay.querySelector<HTMLInputElement>('[name="caption"]');
  const ok = () => { closeEditDialog(); commit(overlay); };

  overlay.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest("[data-ok]")) ok();
    else if (t?.closest("[data-cancel]")) closeEditDialog();
  });
  // キー操作はダイアログの中で止める（図の Undo や Esc の操作に届かないように）
  overlay.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); closeEditDialog(); return; }
    if (e.key === "Tab") {
      // Tab で後ろの要素へ移らないよう、ダイアログの中を巡らせる
      const items = [...overlay.querySelectorAll<HTMLElement>("input:not(:disabled):not([type=hidden]), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next]?.focus();
      return;
    }
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.target === caption) { e.preventDefault(); ok(); }
  });
  // 後ろの図やページへ、ポインタの操作も届かせない（オーバーレイの上で受け止める）
  for (const type of ["pointerdown", "pointerup", "dblclick", "wheel"] as const) {
    overlay.addEventListener(type, e => e.stopPropagation());
  }

  open = { overlay, back: document.activeElement, unhelp: setupHelp(overlay) };
  document.body.appendChild(overlay);
  caption?.focus();
  caption?.select();
  return overlay;
}

export const editDialogOpen = (): boolean => open != null;
