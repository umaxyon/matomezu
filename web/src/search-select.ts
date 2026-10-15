/*
 * 文字で絞り込んで 1 つ選ぶ部品（D29。2026-10-16 ユーザー: ページ・ブックが多い、名前が長いときに、スクロールして探す手間を省く）。
 * 上に検索欄、下に候補の一覧（一覧の中だけスクロール）。検索欄に入れた文字を名前に含む候補だけを出す（大文字・小文字は区別しない）。
 * 候補を押すか、↑↓ で動かして Enter で選ぶ。選んだ候補は一覧で強調する（絞り込んで見えなくなっても選んだまま）。
 * どの画面のものでもない部品で、ダイアログ（ページリンク・ブックリンクの選択）から使う。
 *
 *   const s = createSearchSelect({ options, value, placeholder, onChange });
 *   host.appendChild(s.el);
 *   s.value(); // 選んでいる候補の value（無ければ null）
 */
import { esc, injectStyle } from "./dom";

export interface SearchOption {
  value: string;
  label: string;  // 一覧に出す名前（絞り込みもこの文字で）
  note?: string;  // 名前の右に薄く出す補足（パターンなど）
}

export interface SearchSelect {
  el: HTMLElement;
  value(): string | null;
  focus(): void;
}

const STYLE_ID = "matomezu-search-select-style";
const CSS = `
.mz-ss { border: 1px solid var(--dlg-line, rgba(127, 127, 127, 0.3)); border-radius: 6px; overflow: hidden; background: var(--dlg-control, transparent); }
.mz-ss-search { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--dlg-line, rgba(127, 127, 127, 0.3)); }
.mz-ss-search svg { flex: none; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; opacity: 0.6; }
.mz-ss-input { flex: 1; min-width: 0; font: inherit; color: inherit; background: transparent; border: 0; outline: 0; padding: 0; }
.mz-ss-list { max-height: 168px; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.mz-ss-item { display: flex; align-items: baseline; gap: 8px; padding: 6px 10px; cursor: pointer; border-bottom: 1px solid var(--dlg-line, rgba(127, 127, 127, 0.2)); }
.mz-ss-item:last-child { border-bottom: 0; }
.mz-ss-item .mz-ss-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mz-ss-item .mz-ss-note { flex: none; font-size: 11px; opacity: 0.6; }
.mz-ss-item:hover, .mz-ss-item.mz-ss-active { background: color-mix(in srgb, currentColor 10%, transparent); }
.mz-ss-item[aria-selected="true"] { box-shadow: inset 3px 0 0 var(--dlg-accent, #8b6cf0); font-weight: 600; }
.mz-ss-empty { padding: 8px 10px; opacity: 0.6; font-size: 12px; }
`;

export function createSearchSelect(o: {
  options: SearchOption[];
  value: string | null;
  placeholder: string;
  empty: string;                       // 絞り込んで 1 つも無いときの文
  onChange?: (value: string) => void;  // 選び直した
}): SearchSelect {
  injectStyle(STYLE_ID, CSS);
  let value = o.options.some(x => x.value === o.value) ? o.value : null;
  let active = -1; // ↑↓ で動かしている候補（見えている候補の中の番号）
  const el = document.createElement("div");
  el.className = "mz-ss";
  el.innerHTML = `<div class="mz-ss-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
    <input class="mz-ss-input" type="text" placeholder="${esc(o.placeholder)}" aria-label="${esc(o.placeholder)}"></div>
    <ul class="mz-ss-list" role="listbox"></ul>`;
  const input = el.querySelector<HTMLInputElement>(".mz-ss-input")!;
  const list = el.querySelector<HTMLElement>(".mz-ss-list")!;
  const shown = () => {
    const q = input.value.trim().toLowerCase();
    return q ? o.options.filter(x => x.label.toLowerCase().includes(q)) : o.options;
  };
  function render() {
    const items = shown();
    if (active >= items.length) active = items.length - 1;
    list.innerHTML = items.length
      ? items.map((x, i) => `<li class="mz-ss-item${i === active ? " mz-ss-active" : ""}" role="option" data-value="${esc(x.value)}" aria-selected="${x.value === value}">
          <span class="mz-ss-label">${esc(x.label)}</span>${x.note ? `<span class="mz-ss-note">${esc(x.note)}</span>` : ""}</li>`).join("")
      : `<li class="mz-ss-empty">${esc(o.empty)}</li>`;
    list.querySelector(".mz-ss-active")?.scrollIntoView?.({ block: "nearest" });
  }
  function pick(v: string) {
    value = v;
    render();
    o.onChange?.(v);
  }
  list.addEventListener("click", e => {
    const li = e.target instanceof Element ? e.target.closest<HTMLElement>(".mz-ss-item") : null;
    if (li) pick(li.dataset.value!);
  });
  input.addEventListener("input", () => { active = shown().length ? 0 : -1; render(); });
  input.addEventListener("keydown", e => {
    const items = shown();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      active = e.key === "ArrowDown" ? Math.min(items.length - 1, active + 1) : Math.max(0, active - 1);
      render();
    } else if (e.key === "Enter" && !e.isComposing && !e.ctrlKey && !e.metaKey && active >= 0 && items[active]) {
      e.preventDefault(); // ダイアログの確定ではなく、候補を選ぶ
      pick(items[active]!.value);
    }
  });
  render();
  // 選んでいる候補が見えるように（一覧の外へ出るほど下にあるとき）
  queueMicrotask(() => list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" }));
  return { el, value: () => value, focus: () => input.focus() };
}
