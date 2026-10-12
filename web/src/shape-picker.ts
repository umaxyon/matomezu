/*
 * 形を選ぶ絵の並び（残課題 E11。サイドバーと編集ダイアログで同じものを使う）。
 * 形をまとまり（validate.ts の SHAPE_GROUPS）ごとに絵で並べ、押せば決まる（ラジオボタン。名前はポインタを乗せたときと読み上げ）。
 * - 形はどこでも同じに使える（2026-10-12 ユーザー）ので、どの箱でも全部の形を並べる
 * - 選べない形（off が理由を返す）は薄くして押せなくし、理由はポインタを乗せたときに出す
 *
 *   shapePicker({ name, value, shapes, off })  // HTML
 *   syncShapePicker(root, name, off)           // 選べるかどうかだけを付け直す（ダイアログで本文を書き始めたときなど）
 */

import { esc, injectStyle } from "./dom";
import { t } from "./i18n";
import { shapeIcon } from "./shape-icons";
import type { Shape } from "./types";
import { SHAPE_GROUPS, SHAPE_LABELS } from "./validate";

const STYLE_ID = "matomezu-shape-picker-style";
// 色はダイアログ（--dlg-*）かサイドバー（--mzp-*）のものを使う
const CSS = `
.mz-sp { --sp-accent: var(--dlg-accent, var(--mzp-accent, #8b6cf0)); --sp-control: var(--dlg-control, var(--mzp-control, #3a3a3f)); }
.mz-sp-group { display: flex; flex-wrap: wrap; gap: 3px; }
.mz-sp-group + .mz-sp-group { margin-top: 8px; }
.mz-sp-item { position: relative; display: flex; align-items: center; justify-content: center; width: 29px; height: 29px; border-radius: 6px; background: var(--sp-control); cursor: pointer; }
.mz-sp-item input { position: absolute; opacity: 0; pointer-events: none; }
.mz-sp-item:has(input:checked) { background: var(--sp-accent); color: #fff; }
.mz-sp-item:has(input:disabled) { opacity: 0.35; cursor: default; }
.mz-sp-item:has(input:focus-visible) { outline: 2px solid var(--sp-accent); outline-offset: 1px; }
.mz-sp-icon { display: block; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
.mz-sp-icon.mz-art-icon * { vector-effect: non-scaling-stroke; stroke-width: 1.3px; }
.mz-sp-icon .mz-art-dot { fill: currentColor; stroke: none; }
.mz-sp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

export interface ShapePickerOptions {
  name: string;               // ラジオボタンの name
  value: Shape;               // 今の形
  off: (s: Shape) => string | null; // 選べない理由（選べれば null）
}

const titleOf = (s: Shape, why: string | null) => (why ? `${SHAPE_LABELS[s]}\n${why}` : SHAPE_LABELS[s]);

export function shapePicker(o: ShapePickerOptions): string {
  injectStyle(STYLE_ID, CSS);
  return `<div class="mz-sp" role="radiogroup" aria-label="${t("形")}">${SHAPE_GROUPS.map(g =>
    `<div class="mz-sp-group" role="group" aria-label="${esc(g.label)}">${g.shapes.map(s => {
      const why = o.off(s);
      return `<label class="mz-sp-item" title="${esc(titleOf(s, why))}"><input type="radio" name="${o.name}" value="${s}"` +
        `${s === o.value ? " checked" : ""}${why ? " disabled" : ""}>${shapeIcon(s, "mz-sp-icon")}<span class="mz-sp-sr">${esc(SHAPE_LABELS[s])}</span></label>`;
    }).join("")}</div>`).join("")}</div>`;
}

export function syncShapePicker(root: ParentNode, name: string, off: (s: Shape) => string | null): void {
  for (const r of root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
    const why = off(r.value as Shape);
    r.disabled = !!why;
    r.closest("label")!.title = titleOf(r.value as Shape, why);
  }
}
