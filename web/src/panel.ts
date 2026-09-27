/*
 * 選択中のボックスの情報と設定を表示するサイドバー。
 *
 * 使い方:
 *   let panel;
 *   const graph = createGraph(stage, data, { onSelect: info => panel?.show(info) });
 *   panel = createPanel(document.getElementById('sidebar'), graph);
 */

import { esc, injectStyle, toHex } from "./dom";
import type { Graph } from "./graph";
import type { Brief, ChildView, Info, Overflow, Shape, Size } from "./types";

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
`;

const OVERFLOW_LABELS: Record<Overflow, string> = {
  wrap: "幅に合わせて折り返す",
  grow: "中身に合わせて伸ばす",
  clip: "サイズで切り詰める",
};
const KIND_LABELS = { group: "グループ", box: "ボックス" };
const SIZE_HINTS = {
  L: "文字数の制限なし",
  M: "14 文字まで表示。大きさに上限あり（180 × 80）",
  S: "10 文字まで表示。小さい固定サイズ",
};
const VIEW_OPTIONS: [string, string][] = [["nest", "内包"], ["tree", "ツリー"], ["hidden", "非表示"]];
const SHAPE_OPTIONS: [string, string][] = [["box", "ボックス"], ["person", "スティックマン"], ["db", "DB"]];
const VIEW_HINTS = {
  nest: "子を親の中に入れて見せます",
  tree: "子を親の下にぶら下げて見せます（子は自動で並びます）",
  hidden: "子を隠し、▼ で子がいることだけを示します",
};
const PRESETS = ["#ffffff", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#64748b"];
// ワールドの背景によく使う色（明るい色と暗い色）
const BG_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"];

function chips(list: Brief[]): string {
  if (!list.length) return '<span class="mzp-none">なし</span>';
  return '<div class="mzp-chips">' + list.map(x =>
    `<button type="button" class="mzp-chip" data-select="${esc(x.id)}">${esc(x.caption)}</button>`
  ).join("") + "</div>";
}

function segment(name: string, value: string, options: [string, string][]): string {
  return '<div class="mzp-seg">' + options.map(([v, label]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}>${label}</label>`
  ).join("") + "</div>";
}

function html(info: Info): string {
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
      <p class="mzp-hint">${SIZE_HINTS[info.size]}</p>
    </div>`);

    if (info.children.length) {
      parts.push(`<div class="mzp-section"><h3>子の見せ方</h3>
        ${segment("mzp-view", info.childView, VIEW_OPTIONS)}
        <p class="mzp-hint">${VIEW_HINTS[info.childView]}</p>
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
    parts.push(`<div class="mzp-section"><h3>見た目</h3>
      <label class="mzp-check"><input type="checkbox" data-field="fill"${info.fill ? " checked" : ""}>塗りつぶし</label>
      <label class="mzp-check"><input type="checkbox" data-field="border"${info.border ? " checked" : ""}>枠線</label>
    </div>`);
  }

  // S サイズや、内包していない親では中身の扱いを使わない
  if (!info.overflows.length) return parts.join("");
  const target = info.kind === "box" ? "文字" : "子ボックス";
  parts.push(`<div class="mzp-section"><h3>中身（${target}）の扱い</h3>${
    (["wrap", "grow", "clip"] as const).map(ov => {
      const ok = info.overflows.includes(ov);
      return `<label class="mzp-radio${ok ? "" : " mzp-disabled"}">
        <input type="radio" name="mzp-overflow" value="${ov}"${ov === info.overflow ? " checked" : ""}${ok ? "" : " disabled"}>
        ${OVERFLOW_LABELS[ov]}</label>${ok ? "" : '<div class="mzp-note">ワールドより外には伸ばせません</div>'}`;
    }).join("")
  }</div>`);
  return parts.join("");
}

export interface Panel {
  show(info: Info): void;
}

export function createPanel(el: HTMLElement, graph: Graph): Panel {
  injectStyle(STYLE_ID, PANEL_CSS);
  el.classList.add("mzp");
  let info = graph.info(graph.selected());

  function show(next: Info) {
    info = next;
    el.innerHTML = html(info);
  }

  el.addEventListener("click", e => {
    if (!(e.target instanceof Element)) return;
    const chip = e.target.closest<HTMLElement>("[data-select]");
    if (chip) return graph.select(chip.dataset.select!);
    const preset = e.target.closest<HTMLElement>("[data-color]");
    if (preset) return graph.update(info.id, { color: preset.dataset.color! });
    const bg = e.target.closest<HTMLElement>("[data-bg]");
    if (bg) graph.update(null, { background: bg.dataset.bg || null });
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
    if (t.name === "mzp-size") return graph.update(info.id, { size: t.value as Size });
    if (t.name === "mzp-shape") return graph.update(info.id, { shape: t.value as Shape });
    if (t.name === "mzp-view") return graph.update(info.id, { childView: t.value as ChildView });
  });

  show(info);
  return { show };
}
