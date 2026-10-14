/*
 * 郵便箱（D26 の段階 3。docs/UI-plan.md）。ブックごとに、ほかのブックから送られた箱と、LLM が開くよう頼んだブックの知らせが届く。
 * 置き場所はサーバーの状態のフォルダ（internal/server/mail.go）。画面はタブ行の「郵便箱」のボタン（未読の数。99 を超えたら 99+）と、
 * 左のサイドバーの一覧（今の追加削除と同じリスト）で見せる。開いたら読んだことにする。
 * - 箱（kind: "box"）: 好きなページ・箱へドラッグして置く（ほかのブックからの移植と同じ写し。置いた箱は userAdded。パターンの違うページへは置けない）。
 *   置いたら郵便箱から取り除く
 * - ブック（kind: "book"）: 押すと「届いています」のダイアログ（開く・キャンセル）。開くと郵便箱から取り除いて、そのブックへ移る
 *
 *   const box = createMailbox(pane, { openBook });
 *   box.show(docId);   // そのブックの郵便箱を出す（null で隠す）
 *   box.refresh();     // サーバーの知らせ（mail）を受けて読み直す
 */
import { esc, injectStyle } from "./dom";
import { COPY_MIME } from "./graph";
import { openDialog } from "./edit-dialog";
import { t } from "./i18n";
import type { Diagram } from "./types";
import { PATTERN_LABELS, isPattern } from "./validate";

export interface MailBook { kind: "book"; book: string; page: string | null; name: string }
export interface MailBox { kind: "box"; from: string; pattern: string; caption: string; copy: Diagram }
export type MailBody = MailBook | MailBox;
export interface MailItem { id: string; at: number; read: boolean; body: MailBody }

const base = (doc: string) => `d/${encodeURIComponent(doc)}/api/mail`;
const post = (url: string, body: unknown = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function fetchMail(doc: string): Promise<MailItem[]> {
  try {
    const res = await fetch(base(doc), { cache: "no-store" });
    if (!res.ok) return [];
    const items = (await res.json()).items;
    return Array.isArray(items) ? items.filter(i => i && i.body && (i.body.kind === "book" || i.body.kind === "box")) : [];
  } catch {
    return [];
  }
}
export const sendMail = (doc: string, body: MailBody) => post(base(doc), body).then(r => r.ok);
export const readAllMail = (doc: string) => post(base(doc) + "/read").catch(() => {});
export const removeMail = (doc: string, id: string) =>
  fetch(`${base(doc)}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});

// 未読の数の印（99 を超えたら 99+。2026-10-14 ユーザー）
export const badgeText = (n: number) => (n > 99 ? "99+" : n > 0 ? String(n) : "");

// 「届いています」のダイアログ。開くなら onOpen
export function openArrivedDialog(item: MailBook, onOpen: () => void): void {
  openDialog(t("ブックが届きました"), t("開く"),
    `<p class="mz-dlg-message">${esc(t("LLM から「{name}」が届きました。開きますか（キャンセルしても郵便箱に残ります）", { name: item.name }))}</p>`,
    () => onOpen());
}

const STYLE_ID = "matomezu-mailbox-style";
const CSS = `/* i18n-ok（CSS のコメント） */
.mz-mail h3 { margin: 0; padding: 10px 12px; font-size: 13px; border-bottom: 1px solid var(--bar-border, rgba(127,127,127,.2)); }
.mz-mail-list { padding: 6px 8px; }
.mz-mail-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 4px; font-size: 13px; cursor: pointer; }
.mz-mail-row:hover { background: var(--btn-hover, rgba(127,127,127,.15)); }
.mz-mail-row[draggable="true"] { cursor: grab; }
.mz-mail-row.mz-unread .mz-mail-cap { font-weight: 600; }
.mz-mail-chip { flex: none; padding: 1px 6px; border-radius: 10px; font-size: 11px; background: var(--btn, rgba(127,127,127,.2)); }
.mz-mail-cap { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mz-mail-from { flex: none; font-size: 11px; opacity: .6; }
.mz-mail-del { flex: none; border: 0; background: transparent; color: inherit; opacity: .5; cursor: pointer; padding: 0 4px; }
.mz-mail-del:hover { opacity: 1; }
.mz-mail-empty, .mz-mail-note { margin: 8px 12px; font-size: 12px; opacity: .6; }
`;

export interface Mailbox {
  show(doc: string | null): void;
  refresh(): void;
  doc(): string | null;
  pasted(): void; // 図に箱を写した（運んでいた箱を郵便箱から取り除く）
}

export function createMailbox(pane: HTMLElement, o: { openBook: (item: MailBook) => void; onCount?: (unread: number) => void; visible: () => boolean }): Mailbox {
  injectStyle(STYLE_ID, CSS);
  pane.classList.add("mz-mail");
  let doc: string | null = null;
  let items: MailItem[] = [];

  async function load() {
    const d = doc;
    if (!d) { items = []; render(); return; }
    const got = await fetchMail(d);
    if (doc !== d) return;
    items = got;
    // 見えていれば、届いた物を読んだことにする
    if (o.visible() && items.some(i => !i.read)) {
      items = items.map(i => ({ ...i, read: true }));
      void readAllMail(d);
    }
    render();
  }

  function render() {
    o.onCount?.(items.filter(i => !i.read).length);
    const row = (i: MailItem) => {
      const b = i.body;
      const unread = i.read ? "" : " mz-unread";
      const del = `<button type="button" class="mz-mail-del" data-del="${esc(i.id)}" title="${t("郵便箱から消す")}" aria-label="${t("郵便箱から消す")}">×</button>`;
      if (b.kind === "book") {
        return `<div class="mz-mail-row${unread}" data-open="${esc(i.id)}"><span class="mz-mail-chip">${t("ブック")}</span><span class="mz-mail-cap">${esc(b.name)}</span><span class="mz-mail-from">${t("LLM から")}</span>${del}</div>`;
      }
      const pattern = isPattern(b.pattern) ? PATTERN_LABELS[b.pattern] : b.pattern;
      return `<div class="mz-mail-row${unread}" draggable="true" data-copy="${esc(i.id)}"><span class="mz-mail-chip">${esc(pattern)}</span><span class="mz-mail-cap">${esc(b.caption)}</span><span class="mz-mail-from">${esc(t("{from} から", { from: b.from }))}</span>${del}</div>`;
    };
    pane.innerHTML = `<h3>${t("郵便箱")}</h3><div class="mz-mail-list">${items.length ? items.map(row).join("") : `<p class="mz-mail-empty">${t("届いている物はありません")}</p>`}</div>
      <p class="mz-mail-note">${t("箱は好きなページ・箱へドラッグして置きます（同じパターンのページだけ）。ブックは押すと開けます")}</p>`;
  }

  pane.addEventListener("click", e => {
    const el = e.target instanceof Element ? e.target : null;
    const del = el?.closest<HTMLElement>("[data-del]");
    if (del && doc) { e.stopPropagation(); void removeMail(doc, del.dataset.del!); return; }
    const open = el?.closest<HTMLElement>("[data-open]");
    const item = open && items.find(i => i.id === open.dataset.open);
    if (item && item.body.kind === "book" && doc) {
      const d = doc, body = item.body;
      openArrivedDialog(body, () => { void removeMail(d, item.id); o.openBook(body); });
    }
  });
  // 箱は、ほかのブックからの移植と同じ写しを持ってドラッグする（落とす側は graph。interaction.ts の COPY_MIME）。置けたら郵便箱から取り除く
  pane.addEventListener("dragstart", e => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-copy]") : null;
    const item = el && items.find(i => i.id === el.dataset.copy);
    if (!item || item.body.kind !== "box" || !e.dataTransfer) return;
    e.dataTransfer.setData(COPY_MIME, JSON.stringify({ copy: item.body.copy, from: item.body.from }));
    e.dataTransfer.effectAllowed = "copy";
  });
  // 置けたかは図の知らせ（pasted）で分かる（パターンの違うページへは置けない）。ドラッグの間だけ、運んでいる 1 件を覚えておく
  let dragging: string | null = null;
  pane.addEventListener("dragstart", e => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-copy]") : null;
    dragging = el?.dataset.copy ?? null;
  });
  pane.addEventListener("dragend", () => { setTimeout(() => { dragging = null; }, 0); });

  return {
    show(next) { doc = next; void load(); },
    refresh: () => void load(),
    doc: () => doc,
    pasted() { if (dragging && doc) void removeMail(doc, dragging); dragging = null; },
  };
}
