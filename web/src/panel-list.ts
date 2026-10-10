// サイドバーの追加削除タブ。全ボックスの一覧（表示中と、消したもの）と、ほかのブックの箱（panel.ts から使う）。
// 表示中の行の × で消し、消したものの行を図へドラッグすると戻る（ユーザーが足した箱は × で完全に削除できる）。ほかのブックの行を図へドラッグすると移植する

import { EMPTY_CAPTION, esc } from "./dom";
import { openConfirmDialog } from "./edit-dialog";
import { COPY_MIME, type Graph, REMOVED_MIME } from "./graph";
import { helpIcon } from "./help";
import { copySubtree, liveItems } from "./pages";
import type { Diagram, Items, ListItem } from "./types";

// 一覧の 1 行。表示中は押すと選び（今のページの箱だけ）、右端の × で消す（どのページの箱でも）。
// 消したものは図へドラッグすると戻る。
// キャプションは「id_」を付けて幅に入るだけ出し、はみ出た分は … にする（CSS）。全文はポインタを乗せると出る
function row(item: ListItem, removed: boolean, selectable = true, copyFrom?: string): string {
  const parent = item.parent != null ? `<span class="mzp-row-parent">${esc(item.parent)} の中</span>` : "";
  const caption = item.caption.replace(/\s+/g, " ").trim() || EMPTY_CAPTION;
  const attrs = copyFrom != null
    ? ` class="mzp-row mzp-copy" draggable="true" data-copy-book="${esc(copyFrom)}" data-copy="${esc(item.id)}" title="図へドラッグすると、この図にコピーします（子と、中の線も）"`
    : removed
    ? ` class="mzp-row mzp-removed" draggable="true" data-restore="${esc(item.id)}" title="図へドラッグすると戻ります"`
    : selectable ? ` class="mzp-row" data-select="${esc(item.id)}"` : ` class="mzp-row mzp-elsewhere"`;
  return `<li${attrs}>
    <span class="mzp-swatch" style="background:${esc(item.color)}"></span>
    <span class="mzp-row-text"><span class="mzp-row-cap" title="${esc(item.caption)}">${esc(item.id)}_${esc(caption)}</span>${parent}</span>
    ${copyFrom != null ? ""
      : !removed ? `<button type="button" class="mzp-del" data-remove="${esc(item.id)}" title="消す（子も一緒に消えます）" aria-label="「${esc(item.caption)}」を消す">×</button>`
      // 消したもののうち、ユーザーが足した箱だけ完全に削除できる（LLM から来た箱は、不要と印を付けたものとして残す。docs/ADD-plan.md の 4 章）
      : item.purgeable ? `<button type="button" class="mzp-del" data-purge="${esc(item.id)}" title="完全に削除する（子も一緒に。戻せなくなります）" aria-label="「${esc(item.caption)}」を完全に削除する">×</button>`
      : ""}
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
    `<label class="mzp-check mzp-others"><input type="checkbox" data-others${others.shown ? " checked" : ""}>他ブックも表示` +
      `${helpIcon("タブで開いているほかのブックのボックスも並べます。図へドラッグすると、子と中の線ごとこの図にコピーします（元のブックは変わりません）")}</label>` +
    (!others.shown ? "" : !others.books.length ? '<p class="mzp-hint">ほかに開いているブックはありません</p>' :
      others.books.map(b => {
        const l = liveItems(b.data.nodes ?? [], undefined, "#ffffff");
        return fold(`book:${b.id}`, `${esc(b.name)}（${l.live.length}）`,
          byPage(l, `book:${b.id}:`, i => row(i, false, false, b.id)),
          "mzp-section mzp-fold mzp-other-book");
      }).join(""));
  // 消したものを上に置く（表示中は数が多くなりやすく、下に置くと消したものに気づけないため）
  return fold("removed", `消したもの（${items.removed.length}）` +
      helpIcon("消したボックスは図へドラッグすると戻ります（グループの上に落とすとその中へ）。消す前の線は戻りません"),
      list(items.removed.map(i => row(i, true)))) +
    fold("live", `表示中（${items.live.length}）`, live) + otherHtml;
}

export interface ListTab {
  shown(top: number): void; // タブを開いた（top は検索欄を貼り付ける高さ。タブ列のすぐ下）
  hidden(): void;
  othersChanged(): void;
  destroy(): void;
}

export function createListTab(pane: HTMLElement, graph: Graph, otherBooks?: () => OtherBook[]): ListTab {
  pane.innerHTML = `<div class="mzp-search"><input type="search" class="mzp-input" data-search placeholder="絞り込み（id やキャプション）" aria-label="一覧を絞り込む"></div>
    <div data-list></div>`;
  // 検索欄は描き直しの外に置く（入力中に図が変わっても、フォーカスと文字を失わないように）
  const searchBox = pane.querySelector<HTMLInputElement>("[data-search]")!;
  const listBody = pane.querySelector<HTMLElement>("[data-list]")!;
  const open: Record<Fold, boolean> = {}; // 描き直しても折りたたみを保つ（無ければ開いている）
  let showOthers = false;                 // 「他ブックも表示」
  let visible = false;

  // 一覧は、自分でデータを持たず、いつも図（graph.items()）から作る。作り直すのはデータが変わったとき
  // （graph.onDataChange。呼び忘れの起きない、図の側の仕組み）。一覧が隠れている間は作らずに「古い」と印を付け、
  // タブを開いたときに作る（隠れた一覧を毎回作らない。開けば必ず最新）。docs/REVIEW-2026-10-09.md の 5c
  let stale = true;
  function render() {
    stale = false;
    const others = otherBooks && { shown: showOthers, books: showOthers ? otherBooks() : [] };
    listBody.innerHTML = listHtml(graph.items(), open, others);
    filter();
  }
  function invalidate() {
    stale = true;
    if (visible) render();
  }
  const offData = graph.onDataChange(invalidate);

  // 検索欄の文字（大文字小文字は区別しない）を「id_キャプション」に含む行だけを残す。
  // 検索中は区画をすべて開いて見せ（閉じた区画の中の一致を見落とさないため）、検索をやめたら元の開け閉めに戻す
  function filter() {
    const q = searchBox.value.trim().toLowerCase();
    for (const r of listBody.querySelectorAll<HTMLElement>(".mzp-row")) {
      r.hidden = !!q && !(r.querySelector(".mzp-row-cap")?.textContent ?? "").toLowerCase().includes(q);
    }
    for (const d of listBody.querySelectorAll<HTMLDetailsElement>("details[data-fold]")) {
      d.open = q ? true : open[d.dataset.fold!] ?? true;
    }
  }
  searchBox.addEventListener("input", filter);
  searchBox.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !searchBox.value) return;
    e.stopPropagation(); // 線の 1 つ目の取り消しなど、図の Esc には渡さない
    searchBox.value = "";
    filter();
  });

  // details の開け閉めを覚える（toggle は泡立たないので、捕捉で受け取る）。検索中の開け閉めは覚えない
  pane.addEventListener("toggle", e => {
    if (!(e.target instanceof HTMLDetailsElement) || !e.target.dataset.fold || searchBox.value.trim()) return;
    open[e.target.dataset.fold] = e.target.open;
  }, true);

  pane.addEventListener("click", e => {
    if (!(e.target instanceof Element)) return;
    const del = e.target.closest<HTMLElement>("[data-remove]");
    if (del) return void graph.remove(del.dataset.remove!);
    const purge = e.target.closest<HTMLElement>("[data-purge]");
    if (purge) {
      const id = purge.dataset.purge!;
      const caption = purge.closest(".mzp-row")?.querySelector(".mzp-row-cap")?.textContent ?? id;
      return openConfirmDialog("完全に削除", `「${caption}」を完全に削除します（子も一緒に）。\n消したものの一覧からも消え、図へ戻せなくなります。`, "削除",
        () => graph.purge(id));
    }
    const r = e.target.closest<HTMLElement>("[data-select]");
    if (!r) return;
    graph.select(r.dataset.select!);
    graph.reveal(r.dataset.select!); // 図の見えている範囲の外にあれば見せる
  });

  pane.addEventListener("change", e => {
    if (!(e.target instanceof HTMLInputElement) || e.target.dataset.others == null) return;
    showOthers = e.target.checked;
    render();
  });

  // 消したものの行と、ほかのブックの行を図へドラッグする（落とす側の処理は interaction.ts）
  pane.addEventListener("dragstart", e => {
    if (!(e.target instanceof Element) || !e.dataTransfer) return;
    const r = e.target.closest<HTMLElement>("[data-restore]");
    if (r) {
      e.dataTransfer.setData(REMOVED_MIME, r.dataset.restore!);
      e.dataTransfer.effectAllowed = "move";
      return;
    }
    const c = e.target.closest<HTMLElement>("[data-copy]");
    const book = c && otherBooks?.().find(b => b.id === c.dataset.copyBook);
    if (!c || !book) return;
    // 持っていく中身はドラッグを始めたときに写す（落とす側は、ほかのブックを知らない）
    e.dataTransfer.setData(COPY_MIME, JSON.stringify({ copy: copySubtree(book.data, c.dataset.copy!), from: book.name }));
    e.dataTransfer.effectAllowed = "copy";
  });

  return {
    shown(top) {
      visible = true;
      searchBox.parentElement!.style.top = top + "px";
      if (stale) render();
    },
    hidden() { visible = false; },
    othersChanged() { if (showOthers) invalidate(); },
    destroy() { offData(); },
  };
}
