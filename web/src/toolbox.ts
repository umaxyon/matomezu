// 道具箱: 図の上に浮かせる小さな道具の棚（docs/PATTERN-plan.md の 3.7 章。D26 で、ページのパターンの道具を図の左上に固定で出す形にした）。
// どの戦略のものでもない部品で、並べる道具（tools）と、選んだときの動き（onPick）は呼ぶ側が渡す（view.ts。追加と、フローチャートの形）。
// 道具は押して選ぶ。by はポインタで押したか（"pointer"）、キーボードで押したか（"key"）。押している道具（今のモードの道具）は press で示す
//
//   const box = createToolbox(stage, (key, by) => ...);
//   box.show(anchorEl, [{ key: "circle", label: "円", icon: "<circle .../>" }]);  // anchorEl の右に出す。null なら見えている範囲の左上
//   box.press("circle");  // 押している道具（null なら無し）
//   box.hide();

import { esc, injectStyle } from "./dom";

export interface Tool {
  key: string;
  label: string; // ポインタを乗せたときの名前（読み上げにも使う）
  icon: string;  // SVG の中身（viewBox は 0 0 24 24。線は currentColor）
}

export interface Toolbox {
  show(anchor: HTMLElement | null, tools: Tool[]): void;
  press(key: string | null): void;
  hide(): void;
  destroy(): void;
}

const STYLE_ID = "mz-toolbox-style";
const CSS = `
.mz-toolbox {
  position: absolute; z-index: 20; display: flex; flex-direction: column; gap: 2px; padding: 4px;
  background: #2e2e34; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); user-select: none; -webkit-user-select: none;
}
.mz-toolbox[hidden] { display: none; }
.mz-toolbox button {
  display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 6px;
  color: #f4f4f5; background: transparent; cursor: pointer;
}
.mz-toolbox button:hover, .mz-toolbox button:focus-visible { background: rgba(255, 255, 255, 0.12); outline: none; }
.mz-toolbox button[aria-pressed="true"] { color: #fff; background: #8b6cf0; }
.mz-toolbox svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-toolbox { background: #ffffff; border-color: rgba(0, 0, 0, 0.12); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
  :root:not([data-theme="dark"]) .mz-toolbox button { color: #1b1b1f; }
  :root:not([data-theme="dark"]) .mz-toolbox button:hover { background: rgba(0, 0, 0, 0.07); }
  :root:not([data-theme="dark"]) .mz-toolbox button[aria-pressed="true"] { color: #fff; background: #6d4bd8; }
}
`;

const GAP = 8; // 箱の右の縁との間（左上に出すときは、見えている範囲の縁との間）

const svgOf = (icon: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;

// container は図をスクロールする要素（道具入れはその中に置き、図と一緒にスクロールする）
export function createToolbox(container: HTMLElement, onPick: (key: string, by: "pointer" | "key") => void): Toolbox {
  injectStyle(STYLE_ID, CSS);
  const el = document.createElement("div");
  el.className = "mz-toolbox";
  el.setAttribute("role", "toolbar");
  el.hidden = true;
  container.appendChild(el);
  let shown = "";
  let pressed: string | null = null;
  const markPressed = () => { for (const b of el.querySelectorAll<HTMLElement>("button[data-tool]")) b.setAttribute("aria-pressed", String(b.dataset.tool === pressed)); };
  let pinned = false; // 見えている範囲の左上に出している（スクロールしても動かない）
  const pin = () => {
    el.style.left = container.scrollLeft + GAP + "px";
    el.style.top = container.scrollTop + GAP + "px";
  };
  container.addEventListener("scroll", () => { if (pinned && !el.hidden) pin(); });
  // 図の操作（選択、背景のドラッグ、ダブルクリック）に届けない（道具入れは図をスクロールする要素の中にある）
  for (const type of ["pointerdown", "click", "dblclick"] as const) el.addEventListener(type, e => e.stopPropagation());

  // 押したとき（detail が 0 ならキーボード）
  el.addEventListener("click", e => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-tool]");
    if (b) onPick(b.dataset.tool!, e.detail === 0 ? "key" : "pointer");
  });

  return {
    show(anchor, tools) {
      const key = tools.map(x => x.key).join(",");
      if (key !== shown) {
        el.innerHTML = tools.map(x => `<button type="button" data-tool="${x.key}" title="${esc(x.label)}" aria-label="${esc(x.label)}">${svgOf(x.icon)}</button>`).join("");
        shown = key;
        markPressed();
      }
      pinned = !anchor;
      if (anchor) {
        // 図の中の座標（スクロールした分を足す）で、anchor の右の縁の脇に置く
        const r = anchor.getBoundingClientRect(), c = container.getBoundingClientRect();
        el.style.left = r.right - c.left + container.scrollLeft + GAP + "px";
        el.style.top = r.top - c.top + container.scrollTop + "px";
      } else pin();
      el.hidden = false;
    },
    press(key) { pressed = key; markPressed(); },
    hide() { el.hidden = true; },
    destroy() { el.remove(); },
  };
}
