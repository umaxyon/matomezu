/*
 * 編集ダイアログ（箱は左に形・サイズ・テーマ、右にキャプションと本文、線はキャプション・通り方・線の種類・矢印と、線を消すボタン。docs/BODY-plan.md の段階 3）と、箱の追加のダイアログ（docs/ADD-plan.md）。
 * モーダル: 画面全体を覆い、閉じるまで図やサイドバーを触れなくする。入力中は図を動かさず、確定したときに 1 件の履歴として書く。
 * Ctrl+Enter（Mac は Cmd+Enter）か「確定」（追加は「追加」）で確定、Esc か「キャンセル」で閉じる。キャプションの欄では Enter でも確定する（1 行）。
 *
 *   openEditDialog(graph, id);     // 箱。ダブルクリックと、サイドバーの鉛筆ボタンから開く
 *   openConfirmDialog(title, message, okLabel, onOk); // 取り返しのつかない操作の確認（消したものの完全な削除）
 *   openAddDialog(graph, req);     // 箱の追加。追加モードで図を押したときに開く（req は押した所）
 *   openEdgeEditDialog(graph, id); // 線。線（か札）のダブルクリックと、サイドバーの鉛筆ボタンから開く
 *   closeEditDialog();             // 開いていれば閉じる（図を作り直すときなど）
 *   openDialog(title, okLabel, fields, commit); // ほかの画面（設定など）から、同じ形のダイアログを出す
 */

import { ACCESSES, ACCESS_MARK, type ClassAttr, type ClassOp, cleanMembers } from "./classbox";
import { esc, injectStyle } from "./dom";
import { type Head, headOptions, headsPatch } from "./heads";
import { helpIcon, setupHelp } from "./help";
import { t } from "./i18n";
import type { EdgePatch, Graph } from "./graph";
import type { AddRequest } from "./interaction";
import { THEMES } from "./theme";
import type { BoxData, BoxInfo, Patch, Shape, Size } from "./types";
import { SHAPE_OPTIONS, SHAPE_VARIANTS, shapeFamily } from "./validate";
import { shapeIcon } from "./shape-icons";
import { DEFAULT_SHAPE, shapeDef } from "./shapes";

const STYLE_ID = "matomezu-edit-dialog-style";
const CSS = `/* i18n-ok（CSS のコメントの日本語） */
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
.mz-dlg-btn.mz-dlg-ok.mz-dlg-danger { background: #dc2626; }
.mz-dlg-btn.mz-dlg-delete { color: #f87171; background: transparent; box-shadow: inset 0 0 0 1px currentColor; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .mz-dlg-btn.mz-dlg-delete { color: #dc2626; } }
.mz-dlg-row > label { display: flex; align-items: center; gap: 4px; }
.mz-dlg-message { margin: 0 0 4px; white-space: pre-line; }
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
/* 箱のダイアログ: 左に見た目の設定、縦の線で区切って右に中身（背景の色は変えない。docs/ADD-plan.md の 4 章） */
.mz-dlg.mz-dlg-wide { width: min(672px, 100%); } /* 右の列が約 434px（780px のときの 4/5） */
.mz-dlg-split { display: flex; align-items: stretch; }
.mz-dlg-side {
  flex: none; width: 180px; box-sizing: border-box; padding: 4px 16px 4px 0; margin-right: 18px;
  border-right: 1px solid var(--dlg-line);
}
.mz-dlg-main { flex: 1; min-width: 0; }
.mz-dlg-side h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--dlg-muted); }
.mz-dlg-side .mz-dlg-group { margin-bottom: 16px; }
.mz-dlg-side select.mz-dlg-input { width: 100%; }
.mz-dlg-side .mz-dlg-note { margin: 6px 0 0; }
.mz-dlg-seg { display: flex; border-radius: 6px; overflow: hidden; background: var(--dlg-control); }
.mz-dlg-seg[hidden] { display: none; } /* 形の切り替えは、選んだ形のものだけ出す */
.mz-dlg-input + .mz-dlg-seg, .mz-dlg-seg[data-shapevar] { margin-top: 6px; } /* 形の選択肢と、その下の切り替えの間 */
/* 形の切り替えは絵で見せる（名前は読み上げとポインタを乗せたときだけ。shape-icons.ts） */
.mz-dlg-shape-icon { display: block; width: 20px; height: 20px; margin: 0 auto; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; }
.mz-dlg-sr, .mzp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.mz-dlg-seg label { flex: 1; text-align: center; padding: 4px 2px; cursor: pointer; font-size: 12px; }
.mz-dlg-seg input { position: absolute; opacity: 0; pointer-events: none; }
.mz-dlg-seg label:has(input:checked) { background: var(--dlg-accent); color: #fff; }
.mz-dlg-seg label:has(input:disabled) { opacity: 0.4; cursor: default; }
.mz-dlg-seg label:has(input:focus-visible) { outline: 2px solid var(--dlg-accent); outline-offset: -2px; }
@media (max-width: 600px) {
  .mz-dlg-split { flex-direction: column; }
  .mz-dlg-side { width: auto; padding: 0 0 4px; margin: 0 0 16px; border-right: 0; border-bottom: 1px solid var(--dlg-line); }
}
.mz-dlg-lines .mz-help { margin-left: -2px; }
/* クラスの入力（docs/CLASS-plan.md）。属性・操作の行の一覧は高さを決めてスクロールし（行を足してもダイアログは伸びない）、下に追加のボタン */
.mz-dlg.mz-dlg-wide.mz-dlg-class { width: min(820px, 100%); }
.mz-dlg-mhead { margin: 10px 0 4px; font-weight: 600; }
.mz-dlg-members { height: 124px; box-sizing: border-box; overflow-y: auto; border: 1px solid var(--dlg-line); border-radius: 6px; padding: 4px; }
.mz-dlg-members:empty::before { content: attr(data-empty); display: block; padding: 4px 6px; color: var(--dlg-muted); font-size: 12px; }
.mz-dlg-mrow { display: flex; align-items: center; gap: 4px; padding: 2px 0; font-size: 12px; }
.mz-dlg-mrow .mz-dlg-input { padding: 3px 6px; font-size: 12px; min-width: 0; }
.mz-dlg-mrow select.mz-dlg-input { flex: none; width: 92px; }
.mz-dlg-mrow [name="m-name"] { flex: 3; }
.mz-dlg-mrow [name="m-params"] { flex: 3; }
.mz-dlg-mrow [name="m-type"] { flex: 2; }
.mz-dlg-mflag { display: flex; align-items: center; gap: 2px; flex: none; color: var(--dlg-muted); }
.mz-dlg-mdel { flex: none; width: 24px; height: 24px; padding: 0; font: inherit; line-height: 1; color: var(--dlg-muted); background: transparent; border: 0; border-radius: 4px; cursor: pointer; }
.mz-dlg-mdel:hover { color: #f87171; background: var(--dlg-control); }
.mz-dlg-add { margin-top: 4px; padding: 3px 10px; font-size: 12px; }
.mz-dlg-error { margin: 8px 0 0; color: #f87171; font-size: 12px; }
.mz-dlg-error[hidden], [data-pane][hidden] { display: none; }
/* ダイアログの上に重ねる確認（形を変えると情報が消えるとき） */
.mz-dlg-subwrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.3); padding: 16px; }
.mz-dlg.mz-dlg-sub { width: min(420px, 100%); }
`;

let open: { overlay: HTMLElement; back: Element | null; unhelp: () => void } | null = null;
// ダイアログの上に重ねた確認（confirmInside）。開いているあいだ、Esc はこれを閉じる
let sub: { cancel: () => void; box: HTMLElement } | null = null;

export function closeEditDialog(): void {
  sub = null;
  if (!open) return;
  const { overlay, back, unhelp } = open;
  open = null;
  unhelp();
  overlay.remove();
  if (back instanceof HTMLElement) back.focus();
}

// 本文の最大行数の選択肢（超えた分は … で切る）。データにこれ以外の値があれば、それも選べるように足す
const LINE_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];

// 箱を聞くダイアログ。左に見た目の設定（形・サイズ・テーマ）、右に中身（キャプション・区切り線・本文・箱の幅に合わせる・最大行数）。
// 編集と追加で同じ並び。本文を持つ間は形と S を選べず、形がボックス以外か S のあいだは本文を書けない（サイドバーと同じ決まり）
interface BoxValues {
  caption: string; body: string; rule: boolean; lines: number | null; widthAuto: boolean;
  shape: Shape; size: Size; theme: string; bodyAllowed: boolean;
  // クラスの箱（docs/CLASS-plan.md）。renamed は名前を変えた行（前の名前 → 新しい名前）
  abstract: boolean; attrs: ClassAttr[]; ops: ClassOp[]; renamed: Record<string, string>;
}
type BoxStart = Pick<BoxInfo, "caption" | "body" | "bodyRule" | "bodyLines" | "bodyWidth" | "canBody" | "shape" | "shapes" | "size" | "canShape" | "canClass" | "overflow" | "abstract" | "attrs" | "ops"> & {
  theme: string;      // 書いたテーマ（"" は受け継ぐ）
  sizeFixed: boolean; // 内包・リストの箱（大きさは子の並びで決まり、サイズを使わない）
  kids: number;       // 子の数（クラスにすると消える）
};

// 形を変えると消える情報があれば、その知らせ（無ければ null）。クラスにすると子が消え、クラスでなくすると abstract・属性・操作が消える
export function classChangeWarning(from: Shape, to: Shape, kids: number, hasClassData: boolean): string | null {
  if (to === "class" && from !== "class" && kids > 0) return t("クラスの箱は子を持てません。子 {n} 個（その子孫も）は、消したものの一覧へ移ります", { n: kids });
  if (from === "class" && to !== "class" && hasClassData) return t("クラス名以外の情報（abstract・属性・操作）は捨てられます");
  return null;
}

// 属性・操作の 1 行の入力
function memberRow(kind: "attrs" | "ops", m: Partial<ClassOp>): string {
  const access = `<select class="mz-dlg-input" name="m-access" aria-label="${t("アクセス修飾子")}">
      <option value="">${t("なし")}</option>${ACCESSES.map(a => `<option value="${a}"${a === m.access ? " selected" : ""}>${ACCESS_MARK[a]} ${a}</option>`).join("")}</select>`;
  const flag = (name: string, label: string, on?: boolean) =>
    `<label class="mz-dlg-mflag"><input type="checkbox" name="m-${name}"${on ? " checked" : ""}>${label}</label>`;
  const input = (name: string, value: string | undefined, placeholder: string) =>
    `<input class="mz-dlg-input" type="text" name="m-${name}" value="${esc(value ?? "")}" placeholder="${placeholder}" aria-label="${placeholder}">`;
  return `<div class="mz-dlg-mrow"${m.name ? ` data-orig="${esc(m.name)}"` : ""}>${access}${input("name", m.name, t("名前"))}${
    kind === "ops" ? input("params", m.params, t("引数")) : ""}${input("type", m.type, kind === "ops" ? t("戻り値") : t("型"))}${
    flag("static", "static", m.static)}${kind === "ops" ? flag("abstract", "abstract", m.abstract) : ""}
    <button type="button" class="mz-dlg-mdel" data-del title="${t("行を消す")}" aria-label="${t("行を消す")}">×</button></div>`;
}

// ダイアログ overlay の上に確認を重ねる。okLabel（赤）で true、キャンセルか Esc で false
function confirmInside(overlay: HTMLElement, message: string, okLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    const box = document.createElement("div");
    box.className = "mz-dlg-subwrap";
    box.innerHTML = `<div class="mz-dlg mz-dlg-sub" role="alertdialog" aria-modal="true">
        <p class="mz-dlg-message">${esc(message)}</p>
        <div class="mz-dlg-foot"><span class="mz-dlg-hint"></span>
          <button type="button" class="mz-dlg-btn" data-sub-cancel>${t("キャンセル")}</button>
          <button type="button" class="mz-dlg-btn mz-dlg-ok mz-dlg-danger" data-sub-ok>${esc(okLabel)}</button></div></div>`;
    const done = (v: boolean) => {
      if (sub?.box !== box) return;
      sub = null;
      box.remove();
      resolve(v);
    };
    sub = { box, cancel: () => done(false) };
    box.addEventListener("click", e => {
      e.stopPropagation();
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("[data-sub-ok]")) done(true);
      else if (el?.closest("[data-sub-cancel]")) done(false);
    });
    overlay.appendChild(box);
    box.querySelector<HTMLElement>("[data-sub-ok]")!.focus();
  });
}

// lead はフッターの左端に置くボタン（ツリーを線で描き直す、など）。作ったダイアログを返す
function boxDialog(title: string, okLabel: string, b: BoxStart, commit: (v: BoxValues) => void, lead = ""): HTMLElement {
  const lines = [...new Set([...LINE_CHOICES, ...(b.bodyLines ? [b.bodyLines] : [])])].sort((x, y) => x - y);
  // 形やサイズのほかに本文を出せない理由（ページの箱、キャプションを 1 行にした箱）があるか
  const bodyBase = b.overflow !== "clip" && (b.canBody || !shapeDef(b.shape).body || b.size === "S");
  const off = b.canBody ? "" : " disabled";
  const sizes: Size[] = ["L", "M", "S"];
  // 選べない形（子を内包している箱は、ボックスとクラスだけ）
  // 切り替えのある形（円と角丸、平行四辺形と台形の向き）は、選択肢には家族の先頭を出し、下に切り替えを出す
  const family = shapeFamily(b.shape);
  const shapeOff = new Set(b.canShape ? [] : SHAPE_OPTIONS.map(([v]) => v).filter(v => !(b.canClass && (v === "box" || v === "class"))));
  const side = `<div class="mz-dlg-side">
      <div class="mz-dlg-group"><h3>${t("形")}</h3>
        <select class="mz-dlg-input" name="shape" aria-label="${t("形")}"${b.canShape || b.canClass ? "" : " disabled"}>${SHAPE_OPTIONS.filter(([v]) => b.shapes.includes(v as Shape) || v === family).map(([v, label]) =>
          `<option value="${v}"${v === family ? " selected" : ""}${shapeOff.has(v) ? " disabled" : ""}>${esc(label)}</option>`).join("")}</select>
        ${Object.entries(SHAPE_VARIANTS).map(([f, vars]) => `<div class="mz-dlg-seg" data-shapevar="${f}"${f === family ? "" : " hidden"}>${vars.map(([v, label]) =>
          `<label title="${esc(label)}"><input type="radio" name="shapevar-${f}" value="${v}"${v === b.shape || (f !== family && v === vars[0]![0]) ? " checked" : ""}>${shapeIcon(v, "mz-dlg-shape-icon")}<span class="mz-dlg-sr">${esc(label)}</span></label>`).join("")}</div>`).join("")}
        ${b.canShape ? "" : `<p class="mz-dlg-note">${b.canClass ? t("子を内包している箱は枠なので、選べる形はボックスとクラスだけです") : t("子を内包している箱は枠なので、形を選べません")}</p>`}</div>
      <div class="mz-dlg-group"><h3>${t("サイズ")}</h3>
        <div class="mz-dlg-seg">${sizes.map(v => `<label><input type="radio" name="size" value="${v}"${v === b.size && !b.sizeFixed ? " checked" : ""}${b.sizeFixed ? " disabled" : ""}>${v}</label>`).join("")}</div>
        ${b.sizeFixed ? `<p class="mz-dlg-note">${t("内包・リストの箱の大きさは、子の並びで決まります")}</p>` : ""}
        <p class="mz-dlg-note" data-class-size hidden>${t("クラスの箱の幅は、中身に合わせて決まります")}</p></div>
      <div class="mz-dlg-group"><h3>${t("テーマ")}</h3>
        <select class="mz-dlg-input" name="theme" aria-label="${t("テーマ")}">
          <option value=""${b.theme ? "" : " selected"}>${t("受け継ぐ")}</option>
          ${THEMES.map(th => `<option value="${th.id}"${th.id === b.theme ? " selected" : ""}>${esc(th.label)}</option>`).join("")}
        </select></div>
    </div>`;
  // 区切り線（キャプションと本文の間の線）は、押すたびに入り切りするスイッチ。本文が空のあいだは切って押せなくし、
  // 本文を書き始めたら押せるようにして入れる
  // 「箱の幅に合わせる」は、つまみで本文の幅を変えていれば押せる。内包・リストの箱では本文が箱の幅いっぱいに戻り、
  // 子の無い箱では箱の幅が中身（キャプションと本文）に合わせて決まり直す
  const overlay = show(title, okLabel, `<div class="mz-dlg-split">${side}<div class="mz-dlg-main">
      <label class="mz-dlg-field"><span data-caption-label>${t("キャプション")}</span>
        <input class="mz-dlg-input" type="text" name="caption" value="${esc(b.caption)}" placeholder="${t("なし（空の箱）")}"></label>
      <div data-pane="class" hidden>
        <label class="mz-dlg-check"><input type="checkbox" name="abstract"${b.abstract ? " checked" : ""}>abstract</label>
        <div class="mz-dlg-mhead">${t("属性")}</div>
        <div class="mz-dlg-members" data-list="attrs" data-empty="${t("なし")}">${b.attrs.map(a => memberRow("attrs", a)).join("")}</div>
        <button type="button" class="mz-dlg-btn mz-dlg-add" data-add="attrs">${t("＋ 属性を追加")}</button>
        <div class="mz-dlg-mhead">${t("操作")}</div>
        <div class="mz-dlg-members" data-list="ops" data-empty="${t("なし")}">${b.ops.map(o => memberRow("ops", o)).join("")}</div>
        <button type="button" class="mz-dlg-btn mz-dlg-add" data-add="ops">${t("＋ 操作を追加")}</button>
        <p class="mz-dlg-error" data-member-error hidden></p>
      </div>
      <div data-pane="box">
      <div class="mz-dlg-row"><span>${t("区切り線")}</span>
        <button type="button" class="mz-dlg-switch" role="switch" name="rule" aria-checked="false" aria-label="${t("区切り線")}" disabled></button>
        <span class="mz-dlg-onoff">OFF</span></div>
      <label class="mz-dlg-field mz-dlg-body"><span>${t("本文")}</span>
        <textarea class="mz-dlg-input" name="body" placeholder="${t("なし")}"${off}>${esc(b.body)}</textarea></label>
      <p class="mz-dlg-note" data-body-note${b.canBody ? " hidden" : ""}>${t("本文は、形がボックスで S 以外のサイズ、キャプションを 1 行にしていないときに出せます")}</p>
      <div class="mz-dlg-row">
        <button type="button" class="mz-dlg-btn" data-width-auto${b.bodyWidth && b.canBody ? "" : " disabled"}>${t("箱の幅に合わせる")}</button>
        <input type="hidden" name="width-auto" value="">
        <label class="mz-dlg-lines">${t("最大行数")}${helpIcon(t("超えた分は … で切ります"))}
          <select class="mz-dlg-input" name="lines"${off}>
            <option value=""${b.bodyLines ? "" : " selected"}>${t("制限なし")}</option>
            ${lines.map(v => `<option value="${v}"${v === b.bodyLines ? " selected" : ""}>${t("{n} 行", { n: v })}</option>`).join("")}
          </select></label></div>
      </div>
    </div></div>`,
  overlay => {
    const field = <T extends HTMLElement>(name: string) => overlay.querySelector<T>(`[name="${name}"]`)!;
    const linesValue = field<HTMLSelectElement>("lines").value;
    const size = overlay.querySelector<HTMLInputElement>('[name="size"]:checked')?.value as Size | undefined;
    commit({
      shape: pickedShape(),
      size: size ?? b.size,
      theme: field<HTMLSelectElement>("theme").value,
      bodyAllowed: bodyAllowed(),
      caption: field<HTMLInputElement>("caption").value,
      body: field<HTMLTextAreaElement>("body").value,
      rule: field("rule").getAttribute("aria-checked") === "true",
      lines: linesValue ? Number(linesValue) : null,
      widthAuto: !!field<HTMLInputElement>("width-auto").value,
      ...classValues(),
    });
  }, lead, () => {
    // 属性・操作の名前は重ねられない（線は名前でつなぐため）
    if (shapeField.value !== "class") return true;
    const names = [...overlay.querySelectorAll<HTMLInputElement>('[name="m-name"]')].map(i => i.value.trim()).filter(Boolean);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    const err = overlay.querySelector<HTMLElement>("[data-member-error]")!;
    err.hidden = !dup;
    if (dup) err.textContent = t("属性・操作の名前が重なっています: {name}", { name: dup });
    return !dup;
  });
  overlay.querySelector(".mz-dlg")!.classList.add("mz-dlg-wide");
  const ruleSwitch = overlay.querySelector<HTMLButtonElement>('[name="rule"]')!;
  const setRule = (on: boolean) => {
    ruleSwitch.setAttribute("aria-checked", String(on));
    ruleSwitch.nextElementSibling!.textContent = on ? "ON" : "OFF";
  };
  ruleSwitch.addEventListener("click", () => setRule(ruleSwitch.getAttribute("aria-checked") !== "true"));
  const bodyField = overlay.querySelector<HTMLTextAreaElement>('[name="body"]')!;
  const syncRule = (start: boolean) => {
    const has = !bodyField.disabled && bodyField.value !== "";
    if (has && ruleSwitch.disabled) setRule(start ? b.bodyRule : true);
    if (!has) setRule(false);
    ruleSwitch.disabled = !has;
  };
  syncRule(true);
  bodyField.addEventListener("input", () => syncRule(false));
  // 形・サイズと本文の決まり: 形がボックス以外か S のあいだは本文を書けず、本文があるあいだは形と S を選べない
  const shapeField = overlay.querySelector<HTMLSelectElement>('[name="shape"]')!;
  // 選んだ形（切り替えのある形なら、その切り替えで選んだもの）
  const pickedShape = (): Shape =>
    (overlay.querySelector<HTMLInputElement>(`[name="shapevar-${shapeField.value}"]:checked`)?.value ?? shapeField.value) as Shape;
  shapeField.addEventListener("change", () => {
    for (const g of overlay.querySelectorAll<HTMLElement>("[data-shapevar]")) g.hidden = g.dataset.shapevar !== shapeField.value;
  });
  const sizeS = overlay.querySelector<HTMLInputElement>('[name="size"][value="S"]')!;
  const pickedSize = () => overlay.querySelector<HTMLInputElement>('[name="size"]:checked')?.value ?? b.size;
  const bodyAllowed = () => bodyBase && shapeDef(pickedShape()).body && (b.sizeFixed || pickedSize() !== "S");
  const syncBody = () => {
    const allowed = bodyAllowed();
    for (const el of overlay.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement>('[name="body"], [name="lines"]')) el.disabled = !allowed;
    overlay.querySelector<HTMLElement>("[data-body-note]")!.hidden = allowed;
    const has = allowed && bodyField.value !== "";
    for (const o of shapeField.options) o.disabled = shapeOff.has(o.value) || (has && !shapeDef(o.value as Shape).body);
    const cls = shapeField.value === "class";
    // クラスの箱はサイズを使わない（幅は中身で決まる）
    for (const r of overlay.querySelectorAll<HTMLInputElement>('[name="size"]')) r.disabled = b.sizeFixed || cls || (r === sizeS && has);
    overlay.querySelector<HTMLElement>("[data-class-size]")!.hidden = !cls;
    syncRule(false);
  };
  // 形でクラスを選ぶと、右側をクラスの入力に切り替える（キャプションはクラス名）
  const syncPane = () => {
    const cls = shapeField.value === "class";
    overlay.querySelector<HTMLElement>('[data-pane="class"]')!.hidden = !cls;
    overlay.querySelector<HTMLElement>('[data-pane="box"]')!.hidden = cls;
    overlay.querySelector(".mz-dlg")!.classList.toggle("mz-dlg-class", cls);
    overlay.querySelector("[data-caption-label]")!.textContent = cls ? t("クラス名") : t("キャプション");
  };
  const rowsOf = (kind: "attrs" | "ops") => [...overlay.querySelectorAll<HTMLElement>(`[data-list="${kind}"] > .mz-dlg-mrow`)];
  const hasClassData = () => overlay.querySelector<HTMLInputElement>('[name="abstract"]')!.checked
    || [...rowsOf("attrs"), ...rowsOf("ops")].some(r => r.querySelector<HTMLInputElement>('[name="m-name"]')!.value.trim());
  // 確定したときのクラスの値
  function classValues(): Pick<BoxValues, "abstract" | "attrs" | "ops" | "renamed"> {
    const renamed: Record<string, string> = {};
    const read = (kind: "attrs" | "ops") => rowsOf(kind).map(r => {
      const v = (name: string) => r.querySelector<HTMLInputElement>(`[name="m-${name}"]`)?.value ?? "";
      const on = (name: string) => !!r.querySelector<HTMLInputElement>(`[name="m-${name}"]`)?.checked;
      const m: ClassOp = { name: v("name").trim(), access: (v("access") || undefined) as ClassOp["access"], type: v("type"), static: on("static") };
      if (kind === "ops") { m.params = v("params"); m.abstract = on("abstract"); }
      const orig = r.dataset.orig;
      if (orig && m.name && orig !== m.name) renamed[orig] = m.name;
      return m;
    });
    return { abstract: overlay.querySelector<HTMLInputElement>('[name="abstract"]')!.checked, attrs: cleanMembers(read("attrs")), ops: cleanMembers(read("ops")), renamed };
  }
  let shapeNow = shapeField.value;
  shapeField.addEventListener("change", async () => {
    const next = shapeField.value;
    const warn = classChangeWarning(shapeNow as Shape, next as Shape, b.kids, hasClassData());
    if (warn && !(await confirmInside(overlay, warn, t("変更する")))) {
      shapeField.value = shapeNow;
      shapeField.focus();
      return;
    }
    // クラスでなくしたら、クラス名以外を捨てる（戻しても空から）
    if (shapeNow === "class" && next !== "class") {
      for (const r of [...rowsOf("attrs"), ...rowsOf("ops")]) r.remove();
      overlay.querySelector<HTMLInputElement>('[name="abstract"]')!.checked = false;
    }
    shapeNow = next;
    syncPane();
    syncBody();
  });
  overlay.addEventListener("click", e => {
    const el = e.target instanceof Element ? e.target : null;
    const add = el?.closest<HTMLElement>("[data-add]");
    if (add) {
      const kind = add.dataset.add as "attrs" | "ops";
      const list = overlay.querySelector<HTMLElement>(`[data-list="${kind}"]`)!;
      list.insertAdjacentHTML("beforeend", memberRow(kind, {}));
      const input = list.lastElementChild!.querySelector<HTMLInputElement>('[name="m-name"]')!;
      input.scrollIntoView({ block: "nearest" });
      input.focus();
      return;
    }
    if (el?.closest("[data-del]")) el.closest(".mz-dlg-mrow")!.remove();
  });
  syncPane();
  for (const r of overlay.querySelectorAll<HTMLInputElement>('[name="size"]')) r.addEventListener("change", syncBody);
  bodyField.addEventListener("input", syncBody);
  syncBody();
  // 「箱の幅に合わせる」は確定したときに書く（押したらボタンを押せなくして、押したことを示す）
  overlay.querySelector<HTMLElement>("[data-width-auto]")!.addEventListener("click", e => {
    overlay.querySelector<HTMLInputElement>('[name="width-auto"]')!.value = "1";
    (e.currentTarget as HTMLButtonElement).disabled = true;
  });
  // 選んでいる行数は値で決める（option の selected だけに頼らない）
  overlay.querySelector<HTMLSelectElement>('[name="lines"]')!.value = b.bodyLines ? String(b.bodyLines) : "";
  return overlay;
}

export function openEditDialog(graph: Graph, id: string): void {
  const info = graph.info(id);
  if (info.kind === "world") return;
  const b = info as BoxInfo;
  const sizeFixed = b.framed;
  const start: BoxStart = { ...b, theme: b.theme ?? "", sizeFixed, kids: b.children.length };
  const overlay = boxDialog(t("ボックスの編集"), t("確定"), start, v => {
    // クラスにかかわる変更は、子や線を消すことがあるので別の入口（docs/CLASS-plan.md）
    if (v.shape === "class" || b.shape === "class") {
      graph.updateClass(id, {
        shape: v.shape, caption: v.caption, theme: v.theme || null,
        ...(v.shape === "class" ? { abstract: v.abstract, attrs: v.attrs, ops: v.ops, renamed: v.renamed } : {}),
      });
      return;
    }
    const patch: Patch = {};
    if (v.caption !== b.caption) patch.caption = v.caption;
    if (b.canShape && v.shape !== b.shape) patch.shape = v.shape;
    if (!sizeFixed && v.size !== b.size) patch.size = v.size; // サイズを変えたときだけ（変えると大きさの指定も外れる）
    if (v.theme !== (b.theme ?? "")) patch.theme = v.theme || null;
    if (v.bodyAllowed && v.body !== b.body) patch.body = v.body || null;
    if (v.bodyAllowed && v.body && v.rule !== b.bodyRule) patch.bodyRule = v.rule ? null : false; // 本文が無ければ区切り線は変えない
    if (v.bodyAllowed && v.lines !== b.bodyLines) patch.bodyLines = v.lines;
    if (b.bodyWidth && v.widthAuto) patch.bodyWidth = null;
    if (Object.keys(patch).length) graph.update(id, patch); // まとめて 1 件の変更
  }, b.canFlatten ? `<button type="button" class="mz-dlg-btn" data-flatten>${t("線で描き直す")}</button>` : "");
  // ツリーを線で描き直す（戻せないので確かめてから。ダイアログで直しかけた内容は捨てる。「線を消す」と同じ扱い）
  overlay.querySelector("[data-flatten]")?.addEventListener("click", () => confirmFlatten(graph, id));
}

// ツリーを平らにして線で引き直す前に、戻せないことを確かめる（サイドバーと編集ダイアログから）
export function confirmFlatten(graph: Graph, id: string): void {
  openConfirmDialog(t("線で描き直す"),
    t("ツリーを平らにして、親子のつながりを線で引き直します。見た目はそのままで、箱を自由に動かせるようになります。\n元のツリーには戻せません（すぐ後なら元に戻す（Undo）で戻せます）。"),
    t("描き直す"), () => graph.flattenTree(id));
}

// 追加モードで押した所か道具入れ（toolbox.ts）で選んだ所 req に、新しい箱を足すダイアログ（docs/ADD-plan.md）。「追加」で足して選択モードに戻る。
// 「キャンセル」なら何もせず、追加モードのまま
// shape は最初に選んでおく形（道具入れから足すとき。toolbox.ts）
// size は最初に選んでおくサイズ（道具入れから足すときは、中の箱のサイズ）
export function openAddDialog(graph: Graph, req: AddRequest, shape: Shape = "box", size: Size = "M"): void {
  const start: BoxStart = {
    caption: "", body: "", bodyRule: true, bodyLines: null, bodyWidth: null, canBody: true,
    shape, shapes: graph.kidShapes(req.parentId), size, canShape: true, canClass: true, overflow: "wrap", theme: "", sizeFixed: false,
    abstract: false, attrs: [], ops: [], kids: 0,
  };
  boxDialog(t("ボックスの追加"), t("追加"), start, v => {
    const fields: Partial<BoxData> = {};
    if (v.caption) fields.caption = v.caption;
    // 既定（ボックス・M・受け継ぐ）は書かない
    if (v.shape !== DEFAULT_SHAPE) fields.shape = v.shape;
    if (v.shape === "class") {
      if (v.abstract) fields.abstract = true;
      if (v.attrs.length) fields.attrs = v.attrs;
      if (v.ops.length) fields.ops = v.ops;
    } else if (v.size !== "M") fields.size = v.size;
    if (v.theme) fields.theme = v.theme;
    if (v.bodyAllowed && v.body) fields.body = v.body;
    if (v.body && !v.rule) fields.bodyRule = false;
    if (v.lines) fields.bodyLines = v.lines;
    graph.add(req, fields);
    graph.setMode("move");
  });
}

// 取り返しのつかない操作の確認（消したものの完全な削除など）。okLabel のボタン（赤）で onOk を呼ぶ。キャンセルか Esc なら何もしない
export function openConfirmDialog(title: string, message: string, okLabel: string, onOk: () => void): void {
  const overlay = show(title, okLabel, `<p class="mz-dlg-message">${esc(message)}</p>`, () => onOk());
  const ok = overlay.querySelector<HTMLElement>("[data-ok]")!;
  ok.classList.add("mz-dlg-danger");
  ok.focus();
}

// 線のキャプション、通り方（折れ線・直線。自分に戻る線では出さない）、線の種類（実線・破線）、矢印（始点・終点）。
// 「線を消す」は確定を待たずに消して閉じる
export function openEdgeEditDialog(graph: Graph, id: string): void {
  const e = graph.edgeInfo(id);
  if (!e) return;
  const radios = (name: string, now: string, options: [string, string][]) =>
    options.map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}"${v === now ? " checked" : ""}>${label}</label>`).join("");
  const overlay = show(t("線の編集"), t("確定"), `
      <label class="mz-dlg-field"><span>${t("キャプション")}</span>
        <input class="mz-dlg-input" type="text" name="caption" value="${esc(e.caption ?? "")}" placeholder="${t("なし")}"></label>
      ${e.captionHints.length ? `<div class="mz-dlg-row mz-dlg-hints"><span>${t("候補")}</span>${e.captionHints.map(h =>
        `<button type="button" class="mz-dlg-btn" data-hint="${esc(h)}">${esc(h)}</button>`).join("")}</div>` : ""}
      ${e.self ? "" : `<div class="mz-dlg-row"><span>${t("通り方")}</span>${radios("route", e.route, [["elbow", t("折れ線")], ["straight", t("直線")]])}</div>`}
      <div class="mz-dlg-row"><span>${t("線の種類")}</span>${radios("dash", e.dash, [["solid", t("実線")], ["dashed", t("破線")]])}</div>
      <div class="mz-dlg-row"><span>${t("矢印")}</span>
        ${(["start", "end"] as const).map(side => `<label>${side === "start" ? t("始点") : t("終点")}
          <select class="mz-dlg-input" name="head-${side}" aria-label="${side === "start" ? t("始点の形") : t("終点の形")}">${headOptions().map(([v, label]) =>
            `<option value="${v}"${v === ((side === "start" ? e.startHead : e.endHead) ?? "") ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`).join("")}</div>`,
  overlay => {
    const field = (name: string) => overlay.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const caption = field("caption").value;
    const head = (side: "start" | "end") => (overlay.querySelector<HTMLSelectElement>(`[name="head-${side}"]`)!.value || null) as Head | null;
    const heads = headsPatch(head("start"), head("end"));
    const picked = (name: string) => overlay.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value;
    const route = picked("route") as EdgePatch["route"] | undefined, dash = picked("dash");
    const patch: EdgePatch = {};
    if (caption.trim() !== (e.caption ?? "")) patch.caption = caption;
    if (route && route !== e.route) patch.route = route;
    if (dash && dash !== e.dash) patch.dash = dash === "dashed" ? "dashed" : null;
    // 端の形（heads.ts）。塗りの三角は arrow に、ほかは startHead / endHead に書く
    if (head("start") !== e.startHead || head("end") !== e.endHead) Object.assign(patch, heads);
    if (Object.keys(patch).length) graph.updateEdge(id, patch); // まとめて 1 件の変更にする
  }, `<button type="button" class="mz-dlg-btn mz-dlg-delete" data-delete>${t("線を消す")}</button>`);
  overlay.querySelector("[data-delete]")!.addEventListener("click", () => {
    closeEditDialog();
    graph.removeEdge(id);
  });
  // キャプションの候補を押すと、キャプションの欄に入れる（確定で書く）
  for (const b of overlay.querySelectorAll<HTMLElement>("[data-hint]")) {
    b.addEventListener("click", () => {
      const input = overlay.querySelector<HTMLInputElement>('[name="caption"]')!;
      input.value = b.dataset.hint!;
      input.focus();
    });
  }
}

// ダイアログを出す。fields は項目の HTML、commit は確定したときに項目を読んで書く（変えた項目だけを 1 回の変更として書く。
// 変えていなければ書かない。履歴に残さない）
// lead はフッターの左端に置くボタン（線を消すなど）
export function openDialog(title: string, okLabel: string, fields: string, commit: (overlay: HTMLElement) => void, lead = ""): HTMLElement {
  return show(title, okLabel, fields, commit, lead);
}

// check は確定の前に呼ぶ（false なら閉じずに待つ。入力の誤りを示すのは check の側）
function show(title: string, okLabel: string, fields: string, commit: (overlay: HTMLElement) => void, lead = "", check?: () => boolean): HTMLElement {
  closeEditDialog();
  injectStyle(STYLE_ID, CSS);
  const overlay = document.createElement("div");
  overlay.className = "mz-dlg-overlay";
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  overlay.innerHTML = `<div class="mz-dlg" role="dialog" aria-modal="true" aria-labelledby="mz-dlg-title">
      <h2 id="mz-dlg-title">${esc(title)}</h2>
      ${fields}
      <div class="mz-dlg-foot">
        ${lead}
        <span class="mz-dlg-hint">${esc(t("{key}+Enter で{ok} / Esc でキャンセル", { key: mac ? "⌘" : "Ctrl", ok: okLabel }))}</span>
        <button type="button" class="mz-dlg-btn" data-cancel>${t("キャンセル")}</button>
        <button type="button" class="mz-dlg-btn mz-dlg-ok" data-ok>${esc(okLabel)}</button>
      </div>
    </div>`;
  const caption = overlay.querySelector<HTMLInputElement>('[name="caption"]');
  const ok = () => {
    if (check && !check()) return;
    closeEditDialog();
    commit(overlay);
  };

  overlay.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest("[data-ok]")) ok();
    else if (t?.closest("[data-cancel]")) closeEditDialog();
  });
  // キー操作はダイアログの中で止める（図の Undo や Esc の操作に届かないように）
  overlay.addEventListener("keydown", e => {
    e.stopPropagation();
    // 重ねた確認が開いているあいだは、その中だけで操作する（Esc で確認だけ閉じる）
    if (sub) {
      if (e.key === "Escape") { e.preventDefault(); sub.cancel(); }
      if (e.key === "Tab") {
        const items = [...sub.box.querySelectorAll<HTMLElement>("button")];
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      }
      return;
    }
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
