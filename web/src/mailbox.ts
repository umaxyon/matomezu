/*
 * 郵便箱（D26 の段階 3。docs/UI-plan.md）。ブックごとに、ほかのブックから送られた箱と、LLM からの通知が届く。
 * 置き場所はサーバーの状態のフォルダ（internal/server/mail.go）。画面はタブ行の「郵便箱」のボタン（未読の数。99 を超えたら 99+）と、
 * 左のサイドバーの一覧（今の追加削除と同じリスト）で見せる。欄を開いて題名が見えただけでは読んだことにしない（2026-10-15 ユーザー。
 * D31 の認知（見える所に出たら見た）とは別の決まり）。通知は中身（ダイアログ）を見たら、箱は図に置いたら（行ごと取り除く）読んだことになる。
 * - 箱（kind: "box"）: 好きなページ・箱へドラッグして置く（ほかのブックからの移植と同じ写し。置いた箱は userAdded。パターンの違うページへは置けない）。
 *   置いたら郵便箱から取り除く
 * - 通知（kind: "note"。D30。docs/NOTIFY-plan.md）: LLM の matomezu notify と、matomezu open の「届いています」。題名と本文を持ち、
 *   ブック（ページ）を開く動きを持てる。押すとダイアログを挟む（いきなり移ると今の作業が止まるため。2026-10-15 ユーザー）。
 *   開く動きがあれば「開く / キャンセル」（開いたら取り除く。キャンセルなら読んだことにして残る）、説明だけなら見たら取り除く。
 *   以前の「ブック」（kind: "book"）の行は、読むときに通知に直す
 *
 *   const box = createMailbox(pane, { openBook });
 *   box.show(docId);   // そのブックの郵便箱を出す（null で隠す）
 *   box.refresh();     // サーバーの知らせ（mail）を受けて読み直す
 */
import { esc, injectStyle } from "./dom";
import { COPY_MIME } from "./graph";
import { openSimpleDialog } from "./edit-dialog";
import { t } from "./i18n";
import type { Diagram } from "./types";
import { PATTERN_LABELS, isPattern } from "./validate";

// book があれば、そのブック（page があればそのページ）を開く動きを持つ。name はその名前（郵便箱の行に添える）
// box は開いたらフォーカス枠で示す箱（matomezu focus -mail。D37）
// tour は説明ツアーの開始の案内（D38。押すと開始・拒否・キャンセルのダイアログ）
export interface MailNote { kind: "note"; title: string; body: string; book: string | null; page: string | null; box?: string | null; name?: string; tour?: string }
export interface MailBox { kind: "box"; from: string; pattern: string; caption: string; copy: Diagram }
export type MailBody = MailNote | MailBox;
interface MailBook { kind: "book"; book: string; page: string | null; name: string } // 以前の行（読むときに通知に直す）

// matomezu open の「届いています」の通知（name はブックの題名。ページならページの名前も）
export const arrivedNote = (book: string, page: string | null, name: string): MailNote =>
  ({ kind: "note", title: t("ブックが届きました"), body: t("LLM から「{name}」が届きました。開きますか", { name }), book, page, name });

export interface MailItem { id: string; at: number; read: boolean; body: MailBody }

const base = (doc: string) => `d/${encodeURIComponent(doc)}/api/mail`;
const post = (url: string, body: unknown = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function fetchMail(doc: string): Promise<MailItem[]> {
  try {
    const res = await fetch(base(doc), { cache: "no-store" });
    if (!res.ok) return [];
    const items = (await res.json()).items;
    if (!Array.isArray(items)) return [];
    return items.filter(i => i && i.body && (i.body.kind === "note" || i.body.kind === "box" || i.body.kind === "book"))
      .map(i => (i.body.kind === "book" ? { ...i, body: arrivedNote((i.body as MailBook).book, (i.body as MailBook).page, (i.body as MailBook).name) } : i));
  } catch {
    return [];
  }
}
// 届けた行の id を返す（届けられなければ null）
export const sendMail = (doc: string, body: MailBody): Promise<string | null> =>
  post(base(doc), body).then(async r => (r.ok ? String((await r.json()).id) : null)).catch(() => null);
export const readMail = (doc: string, id: string) => post(`${base(doc)}/${encodeURIComponent(id)}/read`).catch(() => {});
export const removeMail = (doc: string, id: string) =>
  fetch(`${base(doc)}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});

// 未読の数の印（99 を超えたら 99+。2026-10-14 ユーザー）
export const badgeText = (n: number) => (n > 99 ? "99+" : n > 0 ? String(n) : "");

// 通知のダイアログ（単純なダイアログ。いずれ大きな中身を見せることがあれば、編集用の形も選べる。2026-10-15 ユーザー）。開く動きがあれば「開く / キャンセル」で、開くなら onOpen。説明だけなら「閉じる」だけ
export function openNoteDialog(note: MailNote, onOpen?: () => void): void {
  const text = note.body ? `<p class="mz-dlg-message mz-note-body">${esc(note.body)}</p>` : "";
  if (note.book) {
    openSimpleDialog(note.title, t("開く"), text + `<p class="mz-dlg-message mz-note-hint">${esc(t("キャンセルしても郵便箱に残ります"))}</p>`, () => onOpen?.());
    return;
  }
  openSimpleDialog(note.title, t("閉じる"), text, () => {}, { cancel: false });
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
.mz-note-body { white-space: pre-wrap; }
.mz-note-hint { font-size: 12px; opacity: .7; }
`;

export interface Mailbox {
  show(doc: string | null): void;
  refresh(): void;
  doc(): string | null;
  pasted(): void; // 図に箱を写した（運んでいた箱を郵便箱から取り除く）
}

export function createMailbox(pane: HTMLElement, o: { openBook: (item: MailNote) => void; openTour?: (tour: string, doc: string, item: string) => void; onCount?: (unread: number) => void }): Mailbox {
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
    render();
  }

  function render() {
    o.onCount?.(items.filter(i => !i.read).length);
    const row = (i: MailItem) => {
      const b = i.body;
      const unread = i.read ? "" : " mz-unread";
      const del = `<button type="button" class="mz-mail-del" data-del="${esc(i.id)}" title="${t("郵便箱から消す")}" aria-label="${t("郵便箱から消す")}">×</button>`;
      if (b.kind === "note") {
        return `<div class="mz-mail-row${unread}" data-open="${esc(i.id)}"><span class="mz-mail-chip">${b.tour ? t("ツアー") : b.book ? t("ブック") : t("お知らせ")}</span><span class="mz-mail-cap">${esc(b.book && b.name ? t("{title}（{name}）", { title: b.title, name: b.name }) : b.title)}</span><span class="mz-mail-from">${t("LLM から")}</span>${del}</div>`;
      }
      const pattern = isPattern(b.pattern) ? PATTERN_LABELS[b.pattern] : b.pattern;
      return `<div class="mz-mail-row${unread}" draggable="true" data-copy="${esc(i.id)}"><span class="mz-mail-chip">${esc(pattern)}</span><span class="mz-mail-cap">${esc(b.caption)}</span><span class="mz-mail-from">${esc(t("{from} から", { from: b.from }))}</span>${del}</div>`;
    };
    pane.innerHTML = `<h3>${t("郵便箱")}</h3><div class="mz-mail-list">${items.length ? items.map(row).join("") : `<p class="mz-mail-empty">${t("届いている物はありません")}</p>`}</div>
      <p class="mz-mail-note">${t("箱は好きなページ・箱へドラッグして置きます（同じパターンのページだけ）。お知らせとブックは押すと読めます")}</p>`;
  }

  pane.addEventListener("click", e => {
    const el = e.target instanceof Element ? e.target : null;
    const del = el?.closest<HTMLElement>("[data-del]");
    if (del && doc) { e.stopPropagation(); void removeMail(doc, del.dataset.del!); return; }
    const open = el?.closest<HTMLElement>("[data-open]");
    const item = open && items.find(i => i.id === open.dataset.open);
    if (item && item.body.kind === "note" && item.body.tour && doc) {
      if (!item.read) void readMail(doc, item.id);
      o.openTour?.(item.body.tour, doc, item.id); // 説明ツアーの案内（D38）。開始・拒否なら取り除き、キャンセルなら残る
      return;
    }
    if (item && item.body.kind === "note" && doc) {
      const d = doc, body = item.body;
      if (!body.book) void removeMail(d, item.id); // 説明だけの通知は、見たら取り除く
      else if (!item.read) void readMail(d, item.id); // 開く動きのある通知は、中身を見たら読んだことにする（キャンセルなら残る）
      openNoteDialog(body, () => { void removeMail(d, item.id); o.openBook(body); });
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
