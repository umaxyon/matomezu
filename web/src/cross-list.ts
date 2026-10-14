/*
 * マスターの追加削除（D26 の段階 4。docs/UI-plan.md）: ブックをまたいで箱を送る一覧。マスターの道具箱の「追加削除」で左のサイドバーに出す。
 * ブックごとの見出しを開いたときに、そのブックのデータを取りに行き、表示中の箱を並べる（今の追加削除と同じリスト）。
 * 行をマスターの窓へドラッグすると、そのブックの郵便箱へ写しを送る（落とす側は app.ts。元のブックは変わらない）。
 * 将来の案: D24 ディレクトリ構成図のパターンができたら、この一覧をその表示へ移す（2026-10-14 ユーザー）
 *
 *   const list = createCrossList(pane, { books: () => rows, load: id => data });
 *   list.render();
 */
import { EMPTY_CAPTION, esc } from "./dom";
import { DEFAULTS } from "./graph";
import { t } from "./i18n";
import { copySubtree, dataPaint, liveItems, patternOf, pageOf } from "./pages";
import type { Diagram } from "./types";
import { PATTERN_LABELS } from "./validate";

// 行をドラッグするときに持つ中身の種類（図の側の移植（COPY_MIME）とは分ける。図には落とせず、マスターの窓だけが受け取る）
export const CROSS_MIME = "application/x-matomezu-cross";
export interface CrossPayload { from: string; caption: string; pattern: string; copy: ReturnType<typeof copySubtree> }

export interface CrossBook { id: string; title: string }
export interface CrossList { render(): void }

export function createCrossList(pane: HTMLElement, o: { books: () => CrossBook[]; load: (id: string) => Promise<Diagram | null> }): CrossList {
  const open = new Set<string>();             // 開いている見出し（ブックの id）
  const data = new Map<string, Diagram | null>(); // 読んだブック（null は読めなかった）

  function render() {
    const books = o.books();
    pane.innerHTML = `<div class="mzp-tabs"><span class="mzp-tab" aria-selected="true">${t("追加削除（ブックをまたぐ）")}</span></div>
      <p class="mzp-hint" style="margin: 0; padding: 8px 12px">${t("ブックの見出しを開くと箱が並びます。行をマスターの窓へドラッグすると、そのブックの郵便箱へ写しを送ります（元のブックは変わりません）")}</p>` +
      books.map(b => {
        const d = data.get(b.id);
        const body = !open.has(b.id) ? "" : d === undefined ? `<p class="mzp-hint">${t("読み込んでいます…")}</p>`
          : d === null ? `<p class="mzp-hint">${t("読み込めませんでした")}</p>` : rows(b, d);
        return `<details class="mzp-section mzp-fold" data-cross-book="${esc(b.id)}"${open.has(b.id) ? " open" : ""}>
          <summary><h3>${esc(b.title)}</h3></summary>${body}</details>`;
      }).join("");
  }

  function rows(b: CrossBook, d: Diagram): string {
    const l = liveItems(d, undefined, dataPaint(d, DEFAULTS.color));
    if (!l.live.length) return `<span class="mzp-none">${t("なし")}</span>`;
    return `<ul class="mzp-list">${l.live.map(i => {
      const pattern = patternOf(d, pageOf(d.nodes, i.id));
      const caption = i.caption.replace(/\s+/g, " ").trim() || EMPTY_CAPTION;
      const tip = `${i.caption}（${PATTERN_LABELS[pattern]}）\n${t("マスターの窓へドラッグすると、そのブックの郵便箱へ送ります（子と、中の線も）")}`;
      return `<li class="mzp-row mzp-copy" draggable="true" data-cross="${esc(i.id)}" data-cross-from="${esc(b.id)}" title="${esc(tip)}">
        <span class="mzp-swatch" style="background:${esc(i.color)}"></span>
        <span class="mzp-row-text"><span class="mzp-row-cap">${esc(i.id)}_${esc(caption)}</span></span></li>`;
    }).join("")}</ul>`;
  }

  // 見出しを開いたら、そのブックを取りに行く（toggle は泡立たないので捕捉で受け取る）
  pane.addEventListener("toggle", e => {
    const el = e.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.crossBook) return;
    const id = el.dataset.crossBook;
    // 描き直しで open を付けた見出しにも toggle が届くので、覚えている状態と同じなら何もしない（描き直しが続かないように）
    if (el.open === open.has(id)) return;
    if (!el.open) { open.delete(id); return; }
    open.add(id);
    if (data.has(id)) return render();
    render();
    void o.load(id).then(d => { data.set(id, d); render(); });
  }, true);

  pane.addEventListener("dragstart", e => {
    const r = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-cross]") : null;
    const book = r && o.books().find(b => b.id === r.dataset.crossFrom);
    const d = book && data.get(book.id);
    if (!r || !book || !d || !e.dataTransfer) return;
    const id = r.dataset.cross!;
    const payload: CrossPayload = {
      from: book.title, caption: r.querySelector(".mzp-row-cap")?.textContent ?? id,
      pattern: patternOf(d, pageOf(d.nodes, id)), copy: copySubtree(d, id),
    };
    e.dataTransfer.setData(CROSS_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  });

  return { render };
}
