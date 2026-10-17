// ツールのモードの絵（タブ行の切り替えのボタンと、右の長押しで出すアイコン。D39）。追加のモードは道具箱から入るので、選択の絵で見せる
import type { Mode } from "./graph";

const PATHS: Record<Mode, string> = {
  move: '<path d="M6.35 3v16l4.5-4.2 3 6.7 2.6-1.2-3-6.6h5.9z"/>',
  add: '<path d="M6.35 3v16l4.5-4.2 3 6.7 2.6-1.2-3-6.6h5.9z"/>',
  reparent: '<path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/><path d="M3 12h12"/><path d="m11 8 4 4-4 4"/>',
  pan: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5v-8a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V5.5a1.5 1.5 0 0 1 3 0V13"/>'
    + '<path d="M17 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.9-2.5L4.2 14.3a1.5 1.5 0 0 1 2.3-2l1.5 1.7"/>',
};

// モードの絵（svg の文字列。i18n-ok）
export const modeIcon = (m: Mode): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[m]}</svg>`;
