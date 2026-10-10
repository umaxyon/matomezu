// 色を選ぶポップアップ（サイドバーの色のボタンから開く。panel-info.ts）。Figma の形:
//   上: 名前の色（役割）の見本と「なし」。押すとすぐ決まる。役割の名前は出さない（意味を利用者に押し付けない）
//   中: 四角（横が濃さ、縦が明るさ）と、色合いのスライダー、灰色のスライダー（どのテーマでも、色付きと灰色の両方を選べる）
//   下: 値の欄（#rrggbb か、名前）
// 四角とスライダーは、動かしている間はポップアップの見本だけを変え、手を離したときに決める
// （動かすたびに図を直すと、Undo の履歴が大量に積まれるため）。外を押すか Esc で閉じる。開けるのは 1 つだけ
// 画面の座標で置く（サイドバーのようにスクロールする枠の中でも切れないように。help.ts と同じ）

import { esc, injectStyle, toHex } from "./dom";
import { isPaletteName } from "./theme";

export interface ColorPickerOptions {
  anchor: HTMLElement;  // 開いたボタン（この下に出す）
  value: string;        // データの color（名前か色の値。無ければ空）
  paint: string;        // 今の見た目の色
  palette: { name: string; color: string }[];
  onPick(color: string | null): void; // 決めた色（名前・色の値。null は「なし」）
  onClose?(): void;     // 閉じた（外を押した、Esc、別のポップアップを開いた、など）
}

const STYLE_ID = "matomezu-color-picker-style";
const PICKER_CSS = `
.mz-cp {
  position: fixed; z-index: 1000; width: 232px; box-sizing: border-box; padding: 10px;
  display: flex; flex-direction: column; gap: 10px;
  color: #f4f4f5; background: #2e2e34; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); font-size: 12px;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-cp { color: #1b1b1f; background: #ffffff; border-color: rgba(0, 0, 0, 0.12); }
}
.mz-cp-swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mz-cp-swatch {
  width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.45);
}
.mz-cp-swatch[aria-pressed="true"], .mz-cp-none[aria-pressed="true"] { outline: 2px solid #8b6cf0; outline-offset: 2px; }
.mz-cp-none {
  font: inherit; font-size: 11px; color: inherit; cursor: pointer; padding: 2px 8px; border-radius: 4px;
  background: rgba(127, 127, 127, 0.2); border: 0;
}
.mz-cp-sv { position: relative; height: 150px; border-radius: 4px; cursor: crosshair; touch-action: none; overflow: hidden; }
.mz-cp-sv::before, .mz-cp-sv::after { content: ""; position: absolute; inset: 0; }
.mz-cp-sv::before { background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0)); }
.mz-cp-sv::after { background: linear-gradient(to top, #000, rgba(0, 0, 0, 0)); }
.mz-cp-knob {
  position: absolute; z-index: 1; width: 12px; height: 12px; margin: -7px 0 0 -7px; border-radius: 50%;
  border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5); pointer-events: none;
}
.mz-cp-row { display: flex; align-items: center; gap: 8px; }
.mz-cp-current { width: 24px; height: 24px; flex: none; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.45); }
.mz-cp-range { flex: 1; min-width: 0; height: 12px; margin: 0; border-radius: 6px; -webkit-appearance: none; appearance: none; cursor: pointer; }
.mz-cp-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: transparent;
  border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}
.mz-cp-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: transparent; border: 2px solid #fff; }
.mz-cp-hue { background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
.mz-cp-light { background: linear-gradient(to right, #000, #fff); }
.mz-cp-sliders { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.mz-cp-range.mz-cp-off::-webkit-slider-thumb { opacity: 0.35; }
.mz-cp-range.mz-cp-off::-moz-range-thumb { opacity: 0.35; }
.mz-cp-value {
  flex: 1; min-width: 0; box-sizing: border-box; font: inherit; color: inherit; padding: 5px 8px; border-radius: 6px;
  background: rgba(127, 127, 127, 0.15); border: 1px solid rgba(127, 127, 127, 0.3);
}
.mz-cp-value:focus { outline: 2px solid #8b6cf0; outline-offset: -1px; }
.mz-cp-label { opacity: 0.6; flex: none; }
`;

// ---- 色の変換（色合い 0〜360、濃さ・明るさ 0〜1） ----

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// ---- ポップアップ ----

let current: { close(): void } | null = null;

// 開いているポップアップを閉じる（サイドバーで選ぶものが変わったとき、パネルを片付けるとき）
export function closeColorPicker() {
  current?.close();
}

export function openColorPicker(o: ColorPickerOptions): { close(): void } {
  current?.close();
  injectStyle(STYLE_ID, PICKER_CSS);
  const el = document.createElement("div");
  el.className = "mz-cp";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "色を選ぶ");
  const named = isPaletteName(o.value);
  const swatches = o.palette.map(p =>
    `<button type="button" class="mz-cp-swatch" data-name="${esc(p.name)}" style="background:${esc(p.color)}" title="${esc(p.name)}" aria-pressed="${o.value === p.name}"></button>`
  ).join("") + `<button type="button" class="mz-cp-none" data-none aria-pressed="${!o.value}">なし</button>`;
  el.innerHTML = `<div class="mz-cp-swatches">${swatches}</div>
    <div class="mz-cp-sv" aria-label="濃さと明るさ"><div class="mz-cp-knob"></div></div>
    <div class="mz-cp-row"><span class="mz-cp-current"></span>
      <div class="mz-cp-sliders">
        <input class="mz-cp-range mz-cp-hue" type="range" min="0" max="360" aria-label="色合い" title="色合い">
        <input class="mz-cp-range mz-cp-light" type="range" min="0" max="100" aria-label="灰色" title="灰色">
      </div></div>
    <div class="mz-cp-row"><input class="mz-cp-value" type="text" aria-label="色の値（#rrggbb）"></div>`;
  document.body.appendChild(el);

  const $ = <T extends Element>(sel: string) => el.querySelector<T>(sel);
  const swatchCurrent = $<HTMLElement>(".mz-cp-current")!;
  const sv = $<HTMLElement>(".mz-cp-sv")!;
  const knob = $<HTMLElement>(".mz-cp-knob")!;
  const hue = $<HTMLInputElement>(".mz-cp-hue")!;
  const light = $<HTMLInputElement>(".mz-cp-light")!;
  const valueBox = $<HTMLInputElement>(".mz-cp-value")!;

  let [h, s, v] = rgbToHsv(...hexToRgb(toHex(o.paint)));
  const hex = () => hsvToHex(h, s, v);

  // 見本・四角・つまみ・値の欄を、今の色に合わせる（決めはしない）
  // 灰色のスライダーは、灰色（濃さ 0）のときだけ明るさの位置に置く（色付きのときは真ん中）
  function show(valueText?: string) {
    swatchCurrent.style.background = hex();
    sv.style.background = hsvToHex(h, 1, 1);
    knob.style.left = `${s * 100}%`;
    knob.style.top = `${(1 - v) * 100}%`;
    hue.value = String(Math.round(h));
    light.value = String(s === 0 ? Math.round(v * 100) : 50);
    light.classList.toggle("mz-cp-off", s !== 0);
    valueBox.value = valueText ?? hex();
  }

  // 値の欄には、データの値をそのまま出す（名前なら名前、無ければ空）
  show(named || !o.value ? o.value : undefined);

  const pick = (c: string | null) => o.onPick(c);

  el.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target : null;
    const sw = t?.closest<HTMLElement>("[data-name]");
    if (sw) {
      for (const b of el.querySelectorAll("[aria-pressed]")) b.setAttribute("aria-pressed", String(b === sw));
      // 四角・スライダー・値の欄も、押した見本の色に合わせる（値の欄には、名前なら名前を出す）
      const p = o.palette.find(x => x.name === sw.dataset.name);
      if (p) {
        [h, s, v] = rgbToHsv(...hexToRgb(toHex(p.color)));
        show(p.name);
      }
      return pick(sw.dataset.name!);
    }
    if (t?.closest("[data-none]")) {
      for (const b of el.querySelectorAll("[aria-pressed]")) b.setAttribute("aria-pressed", String(b.matches("[data-none]")));
      return pick(null);
    }
  });

  const unpress = () => { for (const b of el.querySelectorAll("[aria-pressed]")) b.setAttribute("aria-pressed", "false"); };

  // 四角: 押した所とドラッグで濃さと明るさを変え、離したら決める
  sv.addEventListener("pointerdown", e => {
    sv.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) => {
      const r = sv.getBoundingClientRect();
      s = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      v = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      show();
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      sv.removeEventListener("pointermove", move);
      sv.removeEventListener("pointerup", up);
      sv.removeEventListener("pointercancel", up);
      unpress();
      pick(hex());
    };
    sv.addEventListener("pointermove", move);
    sv.addEventListener("pointerup", up);
    sv.addEventListener("pointercancel", up);
  });

  // 色合い・灰色のスライダー: 動かしている間は見本だけ、離したら決める（change）。灰色は濃さ 0 の色にする
  hue.addEventListener("input", () => { h = Number(hue.value); if (s === 0) s = 1; show(); });
  hue.addEventListener("change", () => { unpress(); pick(hex()); });
  const toGray = () => { s = 0; v = Number(light.value) / 100; show(); };
  light.addEventListener("input", toGray);
  light.addEventListener("change", () => { toGray(); unpress(); pick(hex()); });

  // 値の欄: Enter かフォーカスが外れたら決める。名前か、解釈できる色だけ（ほかは元に戻す）
  const commitValue = () => {
    const text = valueBox.value.trim();
    if (!text) return;
    if (!isPaletteName(text) && !CSS.supports("color", text)) return show();
    if (!isPaletteName(text)) [h, s, v] = rgbToHsv(...hexToRgb(toHex(text)));
    show(text);
    unpress();
    pick(text);
  };
  valueBox.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); commitValue(); }
    if (e.key === "Escape") close();
    e.stopPropagation(); // 図のキー操作（Esc の取り消しなど）に渡さない
  });
  valueBox.addEventListener("change", commitValue);

  // ボタンの下に出す。画面の右や下からはみ出すなら内側へ寄せる（下が足りなければ上に出す）
  function place() {
    const r = o.anchor.getBoundingClientRect();
    const p = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - p.width - 8));
    const below = r.bottom + 6;
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, r.top - p.height - 6) : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  place();

  const listening = new AbortController();
  // 外を押したら閉じる（開いたボタンを押し直したときは、ボタンの側で閉じる）
  document.addEventListener("pointerdown", e => {
    if (e.target instanceof Node && (el.contains(e.target) || o.anchor.contains(e.target))) return;
    close();
  }, { signal: listening.signal, capture: true });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); }, { signal: listening.signal });

  function close() {
    listening.abort();
    el.remove();
    if (current === handle) current = null;
    o.onClose?.();
  }
  const handle = { close };
  current = handle;
  return handle;
}

// 開いているか（テスト用）
export const colorPickerOpen = () => current != null;
