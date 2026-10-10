// 補足説明の「?」マーク（円で囲んだ ?）と吹き出し。見出しや項目の横に置き、ポインタを乗せるかキーボードで選ぶと説明が出る。
// サイドバー以外でも使える共通の部品:
//   helpIcon(text)   … マークの HTML（text は説明。HTML ではなく文字として出す。改行 \n はそのまま改行になる）
//   setupHelp(root)  … root の中のマークに吹き出しを付ける（root ごとに 1 回。外す関数を返す）
// 吹き出しは画面の座標で置く（サイドバーのようにスクロールする枠の中でも切れないように）

import { esc, injectStyle } from "./dom";

const STYLE_ID = "matomezu-help-style";
const CSS = `
.mz-help {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 14px; height: 14px; margin-left: 5px; vertical-align: middle;
  border: 1px solid currentColor; border-radius: 50%;
  font-size: 9px; font-weight: 700; line-height: 1; font-style: normal;
  opacity: 0.55; cursor: help; user-select: none;
}
.mz-help:hover, .mz-help:focus-visible { opacity: 1; outline: none; }
.mz-help-tip {
  position: fixed; z-index: 1100; max-width: 260px; padding: 7px 9px; border-radius: 6px;
  font-size: 11.5px; font-weight: normal; line-height: 1.55; white-space: pre-line; pointer-events: none;
  color: #f4f4f5; background: #2e2e34; border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-help-tip { color: #1b1b1f; background: #ffffff; border-color: rgba(0, 0, 0, 0.12); }
}
.mz-help-tip[hidden] { display: none; }
`;

export function helpIcon(text: string): string {
  return `<span class="mz-help" tabindex="0" role="img" aria-label="${esc(text)}" data-help="${esc(text)}">?</span>`;
}

export function setupHelp(root: HTMLElement): () => void {
  injectStyle(STYLE_ID, CSS);
  const tip = document.createElement("div");
  tip.className = "mz-help-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  let shown: HTMLElement | null = null;

  const markOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>(".mz-help") : null);

  function show(mark: HTMLElement) {
    shown = mark;
    tip.textContent = mark.dataset.help ?? "";
    tip.hidden = false;
    // マークの下に、左端をそろえて出す。画面の右や下からはみ出すなら内側へ寄せる（下が足りなければ上に出す）
    const r = mark.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - t.width - 8));
    const below = r.bottom + 6;
    const top = below + t.height > window.innerHeight - 8 ? Math.max(8, r.top - t.height - 6) : below;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hide() {
    shown = null;
    tip.hidden = true;
  }

  const listening = new AbortController();
  const { signal } = listening;
  root.addEventListener("mouseover", e => { const m = markOf(e.target); if (m && m !== shown) show(m); }, { signal });
  root.addEventListener("mouseout", e => {
    if (markOf(e.target) && !markOf(e.relatedTarget)) hide();
  }, { signal });
  root.addEventListener("focusin", e => { const m = markOf(e.target); if (m) show(m); }, { signal });
  root.addEventListener("focusout", e => { if (markOf(e.target)) hide(); }, { signal });
  // マークを押しても、まわり（折りたたみの見出しなど）を動かさない
  root.addEventListener("click", e => { if (markOf(e.target)) { e.preventDefault(); e.stopPropagation(); } }, { signal, capture: true });
  // 描き直してマークが消えたら、吹き出しも隠す
  const observer = new MutationObserver(() => { if (shown && !shown.isConnected) hide(); });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    listening.abort();
    observer.disconnect();
    tip.remove();
  };
}
