/*
 * サイドバー。タブが 2 つ:
 *   情報     … 選択中のボックスの情報と設定
 *   追加削除 … 全ボックスの一覧（表示中と、消したもの）。表示中の行の × で消し、消したものの行を図へドラッグすると戻る
 *
 * 使い方:
 *   let panel;
 *   const graph = createGraph(stage, data, { onSelect: info => panel?.show(info) });
 *   panel = createPanel(document.getElementById('sidebar'), graph);
 *   panel.tab("info");           // タブを切り替える
 */

import { esc, injectStyle, keyOf, toHex } from "./dom";
import { COPY_MIME, type Graph, REMOVED_MIME } from "./graph";
import { copySubtree, liveItems } from "./pages";
import type { Brief, ChildView, Dash, Diagram, EdgeInfo, Info, Items, ListItem, Overflow, Shape, Size, TreeDirection } from "./types";

const STYLE_ID = "matomezu-panel-style";
const PANEL_CSS = `
.mzp {
  --mzp-text: #e4e4e7;
  --mzp-muted: rgba(228, 228, 231, 0.6);
  --mzp-line: rgba(255, 255, 255, 0.08);
  --mzp-control: #3a3a3f;
  --mzp-control-hover: #4a4a50;
  --mzp-accent: #8b6cf0;
  color: var(--mzp-text);
  font-size: 13px;
  line-height: 1.5;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mzp {
    --mzp-text: #1b1b1f;
    --mzp-muted: rgba(27, 27, 31, 0.6);
    --mzp-line: rgba(0, 0, 0, 0.1);
    --mzp-control: #ececf0;
    --mzp-control-hover: #dedee4;
    --mzp-accent: #6d4bd8;
  }
}
.mzp-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; }
.mzp-swatch {
  width: 14px; height: 14px; border-radius: 4px; flex: none;
  box-shadow: inset 0 0 0 1px var(--mzp-line);
}
.mzp-title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mzp-kind {
  margin-left: auto; flex: none; font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: var(--mzp-control); color: var(--mzp-muted);
}
.mzp-section { padding: 10px 16px 12px; border-top: 1px solid var(--mzp-line); }
.mzp-section h3 {
  margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  color: var(--mzp-muted);
}
.mzp-dl { display: grid; grid-template-columns: 72px 1fr; gap: 4px 8px; margin: 0; }
.mzp-dl dt { color: var(--mzp-muted); }
.mzp-dl dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.mzp-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.mzp-chip {
  font: inherit; font-size: 12px; color: inherit; cursor: pointer;
  background: var(--mzp-control); border: 0; border-radius: 4px; padding: 1px 8px;
}
.mzp-chip:hover { background: var(--mzp-control-hover); }
.mzp-none { color: var(--mzp-muted); }
.mzp-check, .mzp-radio { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; }
.mzp-radio.mzp-disabled { opacity: 0.45; cursor: not-allowed; }
.mzp-note { font-size: 11px; color: var(--mzp-muted); margin: 2px 0 0 24px; }
.mzp-field { display: grid; grid-template-columns: 72px 1fr; align-items: center; gap: 8px; margin-bottom: 8px; }
.mzp-field > span { color: var(--mzp-muted); }
.mzp-input {
  width: 100%; min-width: 0; box-sizing: border-box; font: inherit; color: inherit;
  background: var(--mzp-control); border: 1px solid var(--mzp-line); border-radius: 6px; padding: 5px 8px;
}
.mzp-input:focus { outline: 2px solid var(--mzp-accent); outline-offset: -1px; }
.mzp-color { display: flex; gap: 6px; min-width: 0; }
.mzp-picker {
  width: 32px; height: 30px; flex: none; padding: 2px; cursor: pointer;
  background: var(--mzp-control); border: 1px solid var(--mzp-line); border-radius: 6px;
}
.mzp-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-left: 80px; }
.mzp-preset {
  width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--mzp-line);
}
.mzp-preset[aria-pressed="true"] { outline: 2px solid var(--mzp-accent); outline-offset: 2px; }
.mzp-seg { display: flex; border-radius: 6px; overflow: hidden; background: var(--mzp-control); }
.mzp-seg label { flex: 1; text-align: center; padding: 4px 2px; cursor: pointer; white-space: nowrap; font-size: 12px; }
.mzp-seg label:hover { background: var(--mzp-control-hover); }
.mzp-seg input { position: absolute; opacity: 0; pointer-events: none; }
.mzp-seg label:has(input:checked) { background: var(--mzp-accent); color: #fff; }
.mzp-seg label:has(input:focus-visible) { outline: 2px solid var(--mzp-accent); outline-offset: -2px; }
.mzp-hint { font-size: 11px; color: var(--mzp-muted); margin: 6px 0 0; }
.mzp-subhead { font-size: 11px; color: var(--mzp-muted); margin: 10px 0 4px; }
.mzp-tabs {
  position: sticky; top: 0; z-index: 1; display: flex; gap: 4px; padding: 8px 12px 0;
  background: inherit; border-bottom: 1px solid var(--mzp-line);
}
.mzp-tab {
  font: inherit; font-size: 12px; color: var(--mzp-muted); cursor: pointer;
  background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 10px; margin-bottom: -1px;
}
.mzp-tab:hover { color: var(--mzp-text); background: none; }
.mzp-tab[aria-selected="true"] { color: var(--mzp-text); border-bottom-color: var(--mzp-accent); font-weight: 600; }
.mzp-pane[hidden] { display: none; }
.mzp-pane > .mzp-section:first-child { border-top: 0; }
.mzp-fold > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.mzp-fold > summary::-webkit-details-marker { display: none; }
.mzp-fold > summary::before {
  content: "▶"; font-size: 8px; line-height: 1; color: var(--mzp-muted); transition: transform 0.15s;
}
.mzp-fold[open] > summary::before { transform: rotate(90deg); }
.mzp-fold > summary h3 { margin: 0; }
.mzp-fold[open] > summary { margin-bottom: 8px; }
.mzp-fold > summary:hover h3 { color: var(--mzp-text); }
.mzp-list { list-style: none; margin: 0; padding: 0; }
.mzp-subfold { margin: 0 0 10px 4px; }
.mzp-subfold > summary h3 { font-size: 12px; }
.mzp-here { margin-left: 6px; font-size: 11px; color: var(--mzp-hint); font-weight: normal; }
.mzp-elsewhere { cursor: default; }
.mzp-danger { color: #fff; background: #dc2626; border-color: transparent; }
.mzp-danger:hover { background: #b91c1c; }
.mzp-row {
  display: flex; align-items: center; gap: 8px; padding: 3px 4px 3px 6px; border-radius: 6px; min-width: 0;
}
.mzp-row:hover { background: var(--mzp-control); }
.mzp-row[data-select] { cursor: pointer; }
.mzp-row[draggable="true"] { cursor: grab; }
.mzp-row .mzp-swatch { width: 10px; height: 10px; border-radius: 3px; }
.mzp-row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.3; }
.mzp-row-cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mzp-row-parent { font-size: 11px; color: var(--mzp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mzp-removed .mzp-row-cap { color: var(--mzp-muted); text-decoration: line-through; }
.mzp-del {
  flex: none; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
  font: inherit; font-size: 15px; line-height: 22px; color: var(--mzp-muted); background: none;
  visibility: hidden;
}
.mzp-row:hover .mzp-del, .mzp-del:focus-visible { visibility: visible; }
.mzp-del:hover { color: #fff; background: #dc2626; }
`;

const OVERFLOW_LABELS: Record<Overflow, string> = {
  wrap: "幅に合わせて折り返す",
  grow: "中身に合わせて伸ばす",
  clip: "サイズで切り詰める",
};
const KIND_LABELS = { group: "グループ", box: "ボックス" };
const SIZE_HINTS = {
  L: "幅は文字に合わせて 400 まで。越えると折り返す",
  M: "幅は文字に合わせて 240 まで。越えると折り返す",
  S: "10 文字まで表示。小さい文字で高さは固定",
};
const VIEW_OPTIONS: [string, string][] = [["nest", "内包"], ["tree", "ツリー"], ["hidden", "非表示"]];
const TREE_DIR_OPTIONS: [string, string][] = [["down", "↓ 下"], ["up", "↑ 上"], ["left", "← 左"], ["right", "→ 右"]];
const SHAPE_OPTIONS: [string, string][] = [["box", "ボックス"], ["person", "スティックマン"], ["db", "DB"]];
const VIEW_HINTS = {
  nest: "子を親の中に入れて見せます",
  tree: "子を親の上下左右にぶら下げて見せます（子は自動で並びます）",
  hidden: "子を隠し、▼ で子がいることだけを示します",
};
const PRESETS = ["#ffffff", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#64748b"];
// ワールドの背景によく使う色（明るい色と暗い色）
const BG_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"];

function chips(list: Brief[]): string {
  if (!list.length) return '<span class="mzp-none">なし</span>';
  return '<div class="mzp-chips">' + list.map(x =>
    `<button type="button" class="mzp-chip" data-select="${esc(x.id)}" title="${esc(x.caption)}">${esc(keyOf(x.id, x.caption))}</button>`
  ).join("") + "</div>";
}

function segment(name: string, value: string, options: [string, string][]): string {
  return '<div class="mzp-seg">' + options.map(([v, label]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}>${label}</label>`
  ).join("") + "</div>";
}

// 選んだ線の情報: ID とつなぐ箱（始点・終点。押すとその箱を選ぶ）、矢印、消すボタン
function edgeHtml(info: EdgeInfo): string {
  const has = (side: "start" | "end") => info.arrow === side || info.arrow === "both";
  return `<div class="mzp-head"><span class="mzp-title">線</span></div>
    <div class="mzp-section"><h3>情報</h3><dl class="mzp-dl">
      <dt>ID</dt><dd>${esc(info.id)}</dd>
      <dt>始点</dt><dd>${chips([info.from])}</dd>
      <dt>終点</dt><dd>${chips([info.to])}</dd>
    </dl></div>
    <div class="mzp-section"><h3>線の種類</h3>
      ${segment("mzp-dash", info.dash, [["solid", "実線"], ["dashed", "破線"]])}
    </div>
    <div class="mzp-section"><h3>矢印</h3>
      <label class="mzp-check"><input type="checkbox" data-arrow="start"${has("start") ? " checked" : ""}>始点</label>
      <label class="mzp-check"><input type="checkbox" data-arrow="end"${has("end") ? " checked" : ""}>終点</label>
    </div>
    <div class="mzp-section">
      <button type="button" class="mzp-chip mzp-danger" data-remove-edge="${esc(info.id)}">線を消す</button>
    </div>`;
}

function html(info: Info): string {
  if (info.kind === "edge") return edgeHtml(info);
  const parts: string[] = [];

  if (info.kind === "world") {
    parts.push(`<div class="mzp-head"><span class="mzp-title">${esc(info.caption)}</span></div>`);
    const bg = info.background;
    const hex = bg ? toHex(bg) : "#ffffff";
    parts.push(`<div class="mzp-section"><h3>背景</h3>
      <div class="mzp-field"><span>色</span>
        <div class="mzp-color">
          <input class="mzp-picker" type="color" data-edit="bg-picker" value="${hex}" aria-label="背景の色を選ぶ">
          <input class="mzp-input" type="text" data-edit="background" value="${esc(bg ?? "")}" placeholder="なし" aria-label="背景の色の値">
        </div>
      </div>
      <div class="mzp-presets">${BG_PRESETS.map(c =>
        `<button type="button" class="mzp-preset" data-bg="${c}" style="background:${c}" title="${c}" aria-pressed="${bg != null && c === hex}"></button>`
      ).join("")}<button type="button" class="mzp-chip" data-bg="" aria-pressed="${bg == null}">なし</button></div>
    </div>`);
  } else {
    parts.push(`<div class="mzp-head">
      <span class="mzp-swatch" style="background:${esc(info.color)}"></span>
      <span class="mzp-title">${esc(info.caption)}</span>
      <span class="mzp-kind">${KIND_LABELS[info.kind]}</span>
    </div>`);

    const hex = toHex(info.color);
    parts.push(`<div class="mzp-section"><h3>編集</h3>
      <label class="mzp-field"><span>キャプション</span>
        <input class="mzp-input" type="text" data-edit="caption" value="${esc(info.caption)}"></label>
      <div class="mzp-field"><span>色</span>
        <div class="mzp-color">
          <input class="mzp-picker" type="color" data-edit="picker" value="${hex}" aria-label="色を選ぶ">
          <input class="mzp-input" type="text" data-edit="color" value="${esc(info.color)}" aria-label="色の値">
        </div>
      </div>
      <div class="mzp-presets">${PRESETS.map(c =>
        `<button type="button" class="mzp-preset" data-color="${c}" style="background:${c}" title="${c}" aria-pressed="${c === hex}"></button>`
      ).join("")}</div>
    </div>`);

    if (info.canShape) {
      parts.push(`<div class="mzp-section"><h3>形</h3>
        ${segment("mzp-shape", info.shape, SHAPE_OPTIONS)}
      </div>`);
    }

    parts.push(`<div class="mzp-section"><h3>サイズ</h3>
      ${segment("mzp-size", info.size, [["L", "L"], ["M", "M"], ["S", "S"]])}
      <p class="mzp-hint">${SIZE_HINTS[info.size]}。押すと中身に合わせた大きさに戻ります</p>
    </div>`);

    if (info.children.length) {
      parts.push(`<div class="mzp-section"><h3>子の見せ方</h3>
        ${segment("mzp-view", info.childView, VIEW_OPTIONS)}
        <p class="mzp-hint">${VIEW_HINTS[info.childView]}</p>
        ${info.childView === "tree" ? `<div class="mzp-subhead">向き</div>${segment("mzp-treedir", info.treeDirection, TREE_DIR_OPTIONS)}` : ""}
      </div>`);
    }
  }

  const rows: [string, string][] = [];
  if (info.kind !== "world") {
    rows.push(["ID", esc(info.id)]);
    rows.push(["親", info.parent ? chips([info.parent]) : "ワールド"]);
    rows.push(["位置", `${info.x}, ${info.y}`]);
  }
  rows.push(["子", chips(info.children)]);
  if (info.kind !== "world") rows.push(["つながり", chips(info.links)]);
  parts.push(`<div class="mzp-section"><h3>情報</h3><dl class="mzp-dl">${
    rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")
  }</dl></div>`);

  if (info.kind !== "world") {
    if (info.sizableChildren >= 2) {
      parts.push(`<div class="mzp-section"><h3>子のサイズ</h3>
        <div class="mzp-chips">
          <button type="button" class="mzp-chip" data-fit="width">幅をそろえる</button>
          <button type="button" class="mzp-chip" data-fit="height">高さをそろえる</button>
          <button type="button" class="mzp-chip" data-fit="both">両方</button>
        </div>
        <p class="mzp-hint">一番小さい子に合わせて縮めます。中身の都合で縮められない子はそのままで、大きくなる子はありません（S サイズ、スティックマン、ツリー・非表示の子は対象外）</p>
      </div>`);
    }
    parts.push(`<div class="mzp-section"><h3>見た目</h3>
      <label class="mzp-check"><input type="checkbox" data-field="fill"${info.fill ? " checked" : ""}>塗りつぶし</label>
      <label class="mzp-check"><input type="checkbox" data-field="border"${info.border ? " checked" : ""}>枠線</label>
    </div>`);
  }

  // S サイズや、内包していない親では中身の扱いを使わない
  if (!info.overflows.length) return parts.join("");
  const target = info.kind === "box" ? "文字" : "子ボックス";
  parts.push(`<div class="mzp-section"><h3>中身（${target}）の扱い</h3>${
    // ワールドでは伸ばすを選べない理由を見せる。文字のボックスには伸ばすを出さない
    (["wrap", "grow", "clip"] as const).filter(ov => info.kind === "world" || info.overflows.includes(ov)).map(ov => {
      const ok = info.overflows.includes(ov);
      return `<label class="mzp-radio${ok ? "" : " mzp-disabled"}">
        <input type="radio" name="mzp-overflow" value="${ov}"${ov === info.overflow ? " checked" : ""}${ok ? "" : " disabled"}>
        ${OVERFLOW_LABELS[ov]}</label>${ok ? "" : '<div class="mzp-note">ワールドより外には伸ばせません</div>'}`;
    }).join("")
  }</div>`);
  return parts.join("");
}

// 一覧の 1 行。表示中は押すと選び（今のページの箱だけ）、右端の × で消す（どのページの箱でも）。
// 消したものは図へドラッグすると戻る。
// キャプションは「id_」を付けて幅に入るだけ出し、はみ出た分は … にする（CSS）。全文はポインタを乗せると出る
function row(item: ListItem, removed: boolean, selectable = true, copyFrom?: string): string {
  const parent = item.parent != null ? `<span class="mzp-row-parent">${esc(item.parent)} の中</span>` : "";
  const caption = item.caption.replace(/\s+/g, " ").trim();
  const attrs = copyFrom != null
    ? ` class="mzp-row mzp-copy" draggable="true" data-copy-book="${esc(copyFrom)}" data-copy="${esc(item.id)}" title="図へドラッグすると、この図にコピーします（子と、中の線も）"`
    : removed
    ? ` class="mzp-row mzp-removed" draggable="true" data-restore="${esc(item.id)}" title="図へドラッグすると戻ります"`
    : selectable ? ` class="mzp-row" data-select="${esc(item.id)}"` : ` class="mzp-row mzp-elsewhere"`;
  return `<li${attrs}>
    <span class="mzp-swatch" style="background:${esc(item.color)}"></span>
    <span class="mzp-row-text"><span class="mzp-row-cap" title="${esc(item.caption)}">${esc(item.id)}_${esc(caption)}</span>${parent}</span>
    ${removed || copyFrom != null ? "" : `<button type="button" class="mzp-del" data-remove="${esc(item.id)}" title="消す（子も一緒に消えます）" aria-label="「${esc(item.caption)}」を消す">×</button>`}
  </li>`;
}

// 一覧の区画（表示中 / 消したもの、ページがあれば表示中の中にページごとの見出し）。見出しを押すと折りたたむ
// （ボックスが多いと下の区画に気づけないため）。キーは "live" / "removed" / "page:<ページの箱の id。最初のページは空>"
export type Fold = string;

// ほかのブック（タブで開いているもの）。一覧の「他ブックも表示」で出し、行を図へドラッグすると移植する（docs/TABS-plan.md 4.3）
export interface OtherBook { id: string; name: string; data: Diagram }

// others は「他ブックも表示」の状態（無ければ、その欄を出さない。サーバーから開いていないとき）。books は shown のときだけ要る
function listHtml(items: Items, open: Record<Fold, boolean>, others?: { shown: boolean; books: OtherBook[] }): string {
  const list = (rows: string[]) => rows.length ? `<ul class="mzp-list">${rows.join("")}</ul>` : '<span class="mzp-none">なし</span>';
  const fold = (name: Fold, title: string, body: string, cls = "mzp-section mzp-fold") =>
    `<details class="${cls}" data-fold="${esc(name)}"${open[name] ?? true ? " open" : ""}>
      <summary><h3>${title}</h3></summary>${body}
    </details>`;
  // ページがあれば、表示中をページごとに分ける。選べるのは今描いているページの箱だけ
  const byPage = (l: Pick<Items, "live" | "pages">, key: string, toRow: (i: ListItem, current: boolean) => string) =>
    l.pages.length <= 1
      ? list(l.live.map(i => toRow(i, true)))
      : l.pages.map(p => {
        const rows = l.live.filter(i => i.page === p.id);
        return fold(`${key}page:${p.id ?? ""}`, `${esc(p.caption)}（${rows.length}）${p.current ? '<span class="mzp-here">表示中のページ</span>' : ""}`,
          list(rows.map(i => toRow(i, p.current))), "mzp-fold mzp-subfold");
      }).join("");
  const live = byPage(items, "", (i, current) => row(i, false, current));
  // ほかのブック。ブックごとの見出しの中を、ページごとに分ける
  const otherHtml = others == null ? "" :
    `<label class="mzp-check mzp-others"><input type="checkbox" data-others${others.shown ? " checked" : ""}>他ブックも表示</label>` +
    (!others.shown ? "" : !others.books.length ? '<p class="mzp-hint">ほかに開いているブックはありません</p>' :
      others.books.map(b => {
        const l = liveItems(b.data.nodes ?? [], undefined, "#ffffff");
        return fold(`book:${b.id}`, `${esc(b.name)}（${l.live.length}）`,
          byPage(l, `book:${b.id}:`, i => row(i, false, false, b.id)) +
          '<p class="mzp-hint">図へドラッグすると、子と中の線ごとこの図にコピーします（元のブックは変わりません）</p>',
          "mzp-section mzp-fold mzp-other-book");
      }).join(""));
  // 消したものを上に置く（表示中は数が多くなりやすく、下に置くと消したものに気づけないため）
  return fold("removed", `消したもの（${items.removed.length}）`, list(items.removed.map(i => row(i, true))) +
      '<p class="mzp-hint">消したボックスは図へドラッグすると戻ります（グループの上に落とすとその中へ）。消す前の線は戻りません</p>') +
    fold("live", `表示中（${items.live.length}）`, live) + otherHtml;
}

export type PanelTab = "info" | "list";

export interface Panel {
  show(info: Info): void;
  tab(name: PanelTab): void;
}

export interface PanelOptions {
  otherBooks?: () => OtherBook[]; // ほかのブック（サーバーから開いたときだけ。無ければ「他ブックも表示」を出さない）
}

export function createPanel(el: HTMLElement, graph: Graph, o: PanelOptions = {}): Panel {
  injectStyle(STYLE_ID, PANEL_CSS);
  el.classList.add("mzp");
  el.innerHTML = `<div class="mzp-tabs" role="tablist">
      <button type="button" class="mzp-tab" role="tab" data-tab="info">情報</button>
      <button type="button" class="mzp-tab" role="tab" data-tab="list">追加削除</button>
    </div>
    <div class="mzp-pane" role="tabpanel" data-pane="info"></div>
    <div class="mzp-pane" role="tabpanel" data-pane="list"></div>`;
  const infoPane = el.querySelector<HTMLElement>('[data-pane="info"]')!;
  const listPane = el.querySelector<HTMLElement>('[data-pane="list"]')!;
  let info: Info = graph.info(graph.selected());
  let current: PanelTab = "info";
  const open: Record<Fold, boolean> = {}; // 描き直しても折りたたみを保つ（無ければ開いている）
  let showOthers = false;                 // 「他ブックも表示」

  // 選択や図の変更のたびに呼ばれるので、一覧もここで描き直す
  function show(next: Info) {
    info = next;
    infoPane.innerHTML = html(info);
    const others = o.otherBooks && { shown: showOthers, books: showOthers ? o.otherBooks() : [] };
    listPane.innerHTML = listHtml(graph.items(), open, others);
  }

  // details の開け閉めを覚える（toggle は泡立たないので、捕捉で受け取る）
  el.addEventListener("toggle", e => {
    if (!(e.target instanceof HTMLDetailsElement) || !e.target.dataset.fold) return;
    open[e.target.dataset.fold] = e.target.open;
  }, true);

  function tab(name: PanelTab) {
    current = name;
    for (const b of el.querySelectorAll<HTMLElement>("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    infoPane.hidden = name !== "info";
    listPane.hidden = name !== "list";
  }

  el.addEventListener("click", e => {
    if (!(e.target instanceof Element)) return;
    const tabBtn = e.target.closest<HTMLElement>("[data-tab]");
    if (tabBtn) return tab(tabBtn.dataset.tab as PanelTab);
    const del = e.target.closest<HTMLElement>("[data-remove]");
    if (del) return void graph.remove(del.dataset.remove!);
    const delEdge = e.target.closest<HTMLElement>("[data-remove-edge]");
    if (delEdge) return graph.removeEdge(delEdge.dataset.removeEdge!);
    const chip = e.target.closest<HTMLElement>("[data-select]");
    if (chip) return graph.select(chip.dataset.select!);
    const preset = e.target.closest<HTMLElement>("[data-color]");
    if (preset) return graph.update(info.id, { color: preset.dataset.color! });
    const bg = e.target.closest<HTMLElement>("[data-bg]");
    if (bg) return graph.update(null, { background: bg.dataset.bg || null });
    // サイズはクリックで受け取る（選んでいるサイズをもう一度押しても、大きさを戻せるように）
    if (e.target instanceof HTMLInputElement && e.target.name === "mzp-size") {
      return graph.update(info.id, { size: e.target.value as Size });
    }
    const fit = e.target.closest<HTMLElement>("[data-fit]");
    if (fit && info.id != null) graph.fitChildren(info.id, fit.dataset.fit as "width" | "height" | "both");
  });

  // 文字入力は Enter で確定する（フォーカスが外れたときも確定する）
  el.addEventListener("keydown", e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches(".mzp-input")) return;
    if (e.key === "Enter") t.blur();
    if (e.key === "Escape") show(info);
  });

  el.addEventListener("change", e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.dataset.others != null) {
      showOthers = t.checked;
      return show(info);
    }
    if (t.name === "mzp-dash" && info.kind === "edge") return graph.updateEdge(info.id, { dash: t.value as Dash });
    // 矢印は、始点と終点の 2 つの選択を合わせて 1 つの値にする
    if (t.dataset.arrow && info.kind === "edge") {
      const on = (side: string) => !!infoPane.querySelector<HTMLInputElement>(`[data-arrow="${side}"]`)?.checked;
      const start = on("start"), end = on("end");
      return graph.updateEdge(info.id, { arrow: start && end ? "both" : start ? "start" : end ? "end" : null });
    }
    const edit = t.dataset.edit;
    if (edit === "caption") return graph.update(info.id, { caption: t.value });
    if (edit === "picker" || edit === "color" || edit === "bg-picker" || edit === "background") {
      const color = t.value.trim();
      // 解釈できない色の文字列は受け付けずに元へ戻す
      if (color && !CSS.supports("color", color)) return show(info);
      if (edit.startsWith("bg") || edit === "background") return graph.update(null, { background: color || null });
      return graph.update(info.id, { color });
    }
    if (t.dataset.field) return graph.update(info.id, { [t.dataset.field]: t.checked });
    if (t.name === "mzp-overflow") return graph.update(info.id, { overflow: t.value as Overflow });
    if (t.name === "mzp-shape") return graph.update(info.id, { shape: t.value as Shape });
    if (t.name === "mzp-treedir") return graph.update(info.id, { treeDirection: t.value as TreeDirection });
    if (t.name === "mzp-view") return graph.update(info.id, { childView: t.value as ChildView });
  });

  // 消したものの行と、ほかのブックの行を図へドラッグする（落とす側の処理は interaction.ts）
  el.addEventListener("dragstart", e => {
    if (!(e.target instanceof Element) || !e.dataTransfer) return;
    const r = e.target.closest<HTMLElement>("[data-restore]");
    if (r) {
      e.dataTransfer.setData(REMOVED_MIME, r.dataset.restore!);
      e.dataTransfer.effectAllowed = "move";
      return;
    }
    const c = e.target.closest<HTMLElement>("[data-copy]");
    const book = c && o.otherBooks?.().find(b => b.id === c.dataset.copyBook);
    if (!c || !book) return;
    // 持っていく中身はドラッグを始めたときに写す（落とす側は、ほかのブックを知らない）
    e.dataTransfer.setData(COPY_MIME, JSON.stringify({ copy: copySubtree(book.data, c.dataset.copy!), from: book.name }));
    e.dataTransfer.effectAllowed = "copy";
  });

  show(info);
  tab(current);
  return { show, tab };
}
