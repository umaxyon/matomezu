// 右クリックのコンテキストメニュー（D42。2026-10-17 ユーザーと決めた形）:
// - 箱・背景（ワールド）・線に出す。右クリックした箱か線を選んでから出す。図の外（ミニマップなど）はブラウザの既定のまま
// - 一番上は設定。箱と背景: 切り取り・コピー・貼り付け（Ctrl+X / Ctrl+C / Ctrl+V と同じ graph.cutSelected / copySelected / pasteClip）、区切り線、削除。
//   背景で開いたら、右クリックした所に貼る。切り取りは写してから削除と同じく消す（消したものの一覧から戻せる）
// - 線: 矢印（端の〇か端の近くを右クリックしたときだけ。2 段目でその端の形）、通り方（2 段目で折れ線・直線。自分に戻る線には無い）、区切り線、削除
// - 設定はいつも一番上（箱はダブルクリックと同じ編集ダイアログ、線は線の編集ダイアログ、背景はブックのダイアログ）、削除はいつも一番下。
//   種類の違う操作の間は区切り線で分ける
// - 使えない項目は消さずに灰色で出す。ショートカットを横に添える
// - 文字の入力欄の中と、文字を選んでいるときはブラウザの既定のメニューを残す
// - 手のひらのモードでは 設定 だけ（2026-10-18 ユーザー）。図の外（タブ行・サイドバーの一覧・郵便箱・ミニマップなど）と、図でメニューを出さないときは、
//   ブラウザのメニューも出さない（setupNoBrowserMenu。文字の入力欄と文字の選択中だけ残す）
// - 出さないとき（Ctrl+C / Ctrl+V と同じ条件）: プレビュー中・ダイアログが開いている・ドラッグ中・選択・付け替え・手のひら以外のモード。
//   説明ツアー中は幕が右クリックを止める（tour-view.ts）
// - 右の長押しと Space はモードの切り替え（mode-picker.ts。setupContextMenu が押し続けと Space を見る）
// 項目は menuFor に足せばよい形にしておく（タブなどへ広げるのと、パターンごとの出し分けは後で。D39・D25）
import type { Graph, MenuTarget } from "./graph";
import { type Head, headOptions, headPatch } from "./heads";
import type { BoxInfo } from "./types";
import { injectStyle } from "./dom";
import { openEdgeEditDialog, openEditDialog } from "./edit-dialog";
import { t } from "./i18n";
import { LONG_PRESS_MS, MOVE_SLOP, openModePicker, pressRing } from "./mode-picker";

const STYLE_ID = "matomezu-context-menu-style";
const CSS = `/* i18n-ok（CSS のコメント） */
.mz-cmenu {
  --cm-bg: #2e2e34; --cm-fg: #f4f4f5; --cm-line: rgba(255, 255, 255, 0.14); --cm-hover: rgba(139, 108, 240, 0.28); --cm-muted: rgba(244, 244, 245, 0.45);
  position: fixed; z-index: 950; min-width: 168px; box-sizing: border-box; padding: 4px; margin: 0; list-style: none;
  color: var(--cm-fg); background: var(--cm-bg); border: 1px solid var(--cm-line); border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); font-size: 13px; line-height: 1.4; user-select: none;
}
.mz-cmenu button {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 24px; width: 100%; padding: 6px 10px; border-radius: 5px; cursor: pointer;
}
.mz-cmenu button:hover:not(:disabled), .mz-cmenu button:focus-visible, .mz-cmenu button.mz-cmenu-open { background: var(--cm-hover); }
.mz-cmenu button:disabled { cursor: default; color: var(--cm-muted); }
.mz-cmenu-check { width: 12px; margin-right: -16px; }
.mz-cmenu-label { flex: 1; }
.mz-cmenu-key { color: var(--cm-muted); font-size: 12px; }
.mz-cmenu hr { border: none; border-top: 1px solid var(--cm-line); margin: 4px 6px; }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-cmenu { --cm-bg: #ffffff; --cm-fg: #1b1b1f; --cm-line: rgba(0, 0, 0, 0.12); --cm-hover: rgba(109, 75, 216, 0.14); --cm-muted: rgba(27, 27, 31, 0.4);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16); }
}
`;

interface Item {
  label: string;
  key?: string;      // 横に添えるショートカット
  checked?: boolean; // 2 段目の選択肢で、今選んでいるもの
  enabled: boolean;
  run?: () => void;  // 押したときの動き（2 段目を持つ項目には無い）
  sub?: Entry[];     // 2 段目（「>」で開く）
}
type Entry = Item | "hr";

// 右クリックした所に出す項目。at は右クリックした所（画面の座標）
function menuFor(graph: Graph, target: MenuTarget, at: { x: number; y: number }, mac: boolean, openBook: () => void): Entry[] {
  const entries = fullMenu(graph, target, at, mac, openBook);
  // 手のひらのモードは見るだけなので、一番上の設定だけ
  return graph.mode() === "pan" ? entries.slice(0, 1) : entries;
}

function fullMenu(graph: Graph, target: MenuTarget, at: { x: number; y: number }, mac: boolean, openBook: () => void): Entry[] {
  const del = mac ? "⌫" : "Delete";
  if (target.kind === "edge") {
    const id = graph.selectedEdge()!;
    const e = graph.edgeInfo(id)!;
    const route = (r: "elbow" | "straight", label: string): Item =>
      ({ label, checked: e.route === r, enabled: true, run: () => { if (e.route !== r) graph.updateEdge(id, { route: r }); } });
    // 端の近くなら、その端の形（線の編集ダイアログと同じ選択肢）
    const side = target.end, now = side === "start" ? e.startHead : e.endHead;
    const heads = side == null ? [] : [{
      label: t("矢印（{side}）", { side: side === "start" ? t("始点") : t("終点") }), enabled: true,
      sub: headOptions().map(([v, label]): Item => ({ label, checked: (now ?? "") === v, enabled: true,
        run: () => { if ((now ?? "") !== v) graph.updateEdge(id, headPatch(e, side, (v || null) as Head | null)); } })),
    }];
    return [
      { label: t("設定"), key: "Enter", enabled: true, run: () => openEdgeEditDialog(graph, id) },
      "hr",
      ...heads,
      ...(e.self ? [] : [{ label: t("通り方"), enabled: true, sub: [route("elbow", t("折れ線")), route("straight", t("直線"))] }]),
      ...(heads.length || !e.self ? ["hr" as const] : []),
      { label: t("削除"), key: del, enabled: true, run: () => graph.removeEdge(id) },
    ];
  }
  const clip = graph.clipState(), mod = mac ? "⌘" : "Ctrl+";
  const box = target.kind === "box" ? graph.selected() : null;
  return [
    // 箱はダブルクリックと同じ編集ダイアログ、背景（ワールド）はブックのダイアログ
    box != null
      ? { label: t("設定"), key: "Enter", enabled: true, run: () => openEditDialog(graph, box) }
      : { label: t("設定"), enabled: true, run: openBook },
    "hr",
    { label: t("切り取り"), key: `${mod}X`, enabled: clip.cut, run: () => { graph.cutSelected(); } },
    { label: t("コピー"), key: `${mod}C`, enabled: clip.copy, run: () => { graph.copySelected(); } },
    { label: t("貼り付け"), key: `${mod}V`, enabled: clip.paste, run: () => { graph.pasteClip(at); } },
    "hr",
    // ツリーの根は消せない（graph.remove も断る）
    { label: t("削除"), key: del, enabled: box != null && !(graph.info(box) as BoxInfo).treeRoot, run: () => { graph.remove(box!); } },
  ];
}

// 入力欄の中か（ブラウザの既定のメニューに譲る）
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.matches("input, textarea, select") || t.isContentEditable);

// 図（stage）の右クリックにメニューを出す。登録を外す関数を返す（ブックを切り替えるときに外す）
// openBook はブックのダイアログを開く（背景の「設定」。タブ行の「ブック」ボタンと同じ）
// 右の長押し（LONG_PRESS_MS）はモードの切り替え（mode-picker.ts）。どのモードでも出す。
// ブラウザの contextmenu は、Windows では離したとき、Mac・Linux では押したときに届く。押している間に届いたものは止めておき、
// 長押しにならずに離したら、そこでメニューを出す（Mac・Linux ではメニューが離したときに出る）。長押しで出したあとの contextmenu は捨てる
export function setupContextMenu(graph: Graph, stage: HTMLElement, openBook: () => void): () => void {
  const listening = new AbortController();
  const { signal } = listening;
  let close: (() => void) | null = null;
  let closePicker: (() => void) | null = null;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  // 右ボタンを押している間の様子。deferred は押している間に届いた contextmenu（離したら出す）
  let press: { x0: number; y0: number; at: { x: number; y: number }; timer: number; ring: { move(at: { x: number; y: number }): void; close(): void } | null;
    deferred: { target: EventTarget | null; at: { x: number; y: number } } | null } | null = null;
  let swallow = false; // 次の contextmenu を捨てる（長押しで出したあとと、右ボタンで閉じたあと）
  const blocked = () => graph.preview() != null || graph.dragging() || !!document.querySelector(".mz-dlg-overlay");

  // メニューを出す（出せたら true）
  const show = (target: EventTarget | null, at: { x: number; y: number }): boolean => {
    close?.();
    if (typing(target) || !(window.getSelection()?.isCollapsed ?? true) || blocked()) return false;
    if (graph.mode() !== "move" && graph.mode() !== "reparent" && graph.mode() !== "pan") return false;
    const picked = graph.pickForMenu(target, at);
    if (!picked) return false;
    close = open(menuFor(graph, picked, at, mac, openBook), at, () => { close = null; });
    return true;
  };
  const endPress = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press.ring?.close();
    press = null;
  };

  stage.addEventListener("pointerdown", e => {
    if (e.button !== 2 || e.pointerType !== "mouse") return;
    swallow = false;
    endPress();
    if (typing(e.target) || blocked() || closePicker) return;
    const at = { x: e.clientX, y: e.clientY };
    const p = {
      x0: at.x, y0: at.y, at, deferred: null, ring: pressRing(at),
      timer: window.setTimeout(() => {
        // 長押しになった: 最後のポインタの位置にモードのアイコンを出す。押している間に届いた contextmenu は出さない
        if (press !== p) return;
        endPress();
        if (blocked()) return;
        close?.();
        swallow = true; // Windows では、このあと離したときに contextmenu が届く
        closePicker = openModePicker(graph, stage, p.at, byRight => { closePicker = null; if (byRight) swallow = true; });
      }, LONG_PRESS_MS),
    };
    press = p;
  }, { signal });
  window.addEventListener("pointermove", e => {
    if (!press) return;
    press.at = { x: e.clientX, y: e.clientY };
    // 遊びより動いたら長押しを取り消す（押している間に届いた contextmenu は、離したときに出す）
    if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > MOVE_SLOP) {
      clearTimeout(press.timer);
      press.ring?.close();
      press.ring = null;
    } else press.ring?.move(press.at);
  }, { signal });
  // 右ボタンを離した（ほかのボタンを押したままでも届くよう mouseup で見る）
  window.addEventListener("mouseup", e => {
    if (e.button !== 2 || !press) return;
    const d = press.deferred;
    endPress();
    if (d) show(d.target, d.at);
  }, { signal });
  window.addEventListener("blur", endPress, { signal });
  // Space でも、最後のポインタの位置（図の外なら図の真ん中）にモードのアイコンを出す（2026-10-18 ユーザー。前は押している間だけ手のひら）。
  // 入力欄・ボタンの上（Space で押す）・ダイアログ・プレビューでは出さない。Space で図がスクロールしないよう止める
  let last: { x: number; y: number } | null = null;
  window.addEventListener("pointermove", e => { last = { x: e.clientX, y: e.clientY }; }, { signal, passive: true });
  document.addEventListener("keydown", e => {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.target instanceof Element && e.target.closest("button, a, select, .mz-dlg-overlay")) return;
    if (blocked() || closePicker || !stage.isConnected || stage.offsetParent === null) return;
    e.preventDefault();
    if (e.repeat) return;
    const r = stage.getBoundingClientRect();
    const inside = last && last.x >= r.left && last.x <= r.right && last.y >= r.top && last.y <= r.bottom;
    endPress();
    close?.();
    closePicker = openModePicker(graph, stage, inside ? last! : { x: r.left + r.width / 2, y: r.top + r.height / 2 }, byRight => { closePicker = null; if (byRight) swallow = true; });
  }, { signal });
  window.addEventListener("contextmenu", e => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }, { signal, capture: true });

  stage.addEventListener("contextmenu", e => {
    const at = { x: e.clientX, y: e.clientY };
    if (press) {
      // 押している間（Mac・Linux）: 長押しになるかは離すまで分からないので、ブラウザのメニューも止めておく。入力欄と文字の選択中はそもそも押し続けを見ない
      e.preventDefault();
      press.deferred = { target: e.target, at };
      return;
    }
    if (show(e.target, at)) e.preventDefault();
  }, { signal });

  return () => {
    listening.abort();
    endPress();
    close?.();
    closePicker?.();
  };
}

// 画面のどこでも、右クリックでブラウザのメニューを出さない（2026-10-18 ユーザー。タブ行・サイドバーの一覧・郵便箱・ミニマップなど）。
// 文字の入力欄の中と、文字を選んでいるときはブラウザのまま（文字のコピー・貼り付けに使う）。図のメニューは setupContextMenu が先に出す
export function setupNoBrowserMenu(root: Document | HTMLElement = document): void {
  root.addEventListener("contextmenu", e => {
    if (typing(e.target) || !(window.getSelection()?.isCollapsed ?? true)) return;
    e.preventDefault();
  });
}

// メニューを出す。閉じる関数を返す
function open(entries: Entry[], at: { x: number; y: number }, closed: () => void): () => void {
  injectStyle(STYLE_ID, CSS);
  const stop = new AbortController();
  const { signal } = stop;
  const lists: HTMLElement[] = []; // 1 段目と、開いている 2 段目
  const close = () => {
    if (signal.aborted) return;
    stop.abort();
    for (const l of lists) l.remove();
    closed();
  };

  // 1 段分の ul を作って置く。place は自分の大きさから置く位置を返す（1 段目は右クリックした所、2 段目は親の項目の右。はみ出すなら左）
  function list(items: Entry[], place: (r: DOMRect) => { left: number; top: number }): HTMLElement {
    const el = document.createElement("ul");
    el.className = "mz-cmenu";
    el.setAttribute("role", "menu");
    let sub: { el: HTMLElement; btn: HTMLButtonElement } | null = null;
    const closeSub = () => {
      if (!sub) return;
      sub.btn.classList.remove("mz-cmenu-open");
      sub.btn.setAttribute("aria-expanded", "false");
      sub.el.remove();
      lists.splice(lists.indexOf(sub.el), 1);
      sub = null;
    };
    const checks = items.some(x => x !== "hr" && x.checked != null);
    for (const it of items) {
      const li = document.createElement("li");
      li.setAttribute("role", it === "hr" ? "separator" : "none");
      if (it === "hr") {
        li.appendChild(document.createElement("hr"));
        el.appendChild(li);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", it.checked == null ? "menuitem" : "menuitemradio");
      if (it.checked != null) b.setAttribute("aria-checked", String(it.checked));
      b.disabled = !it.enabled;
      const span = (cls: string, text: string) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; return s; };
      if (checks) b.appendChild(span("mz-cmenu-check", it.checked ? "✓" : ""));
      b.appendChild(span("mz-cmenu-label", it.label));
      if (it.sub) {
        b.setAttribute("aria-haspopup", "menu");
        b.setAttribute("aria-expanded", "false");
        b.appendChild(span("mz-cmenu-key", ">"));
      } else if (it.key) b.appendChild(span("mz-cmenu-key", it.key));
      const openSub = () => {
        if (!it.sub || b.disabled || sub?.btn === b) return;
        closeSub();
        const r = b.getBoundingClientRect();
        const s = list(it.sub, m => ({ left: r.right + m.width + 2 > window.innerWidth ? r.left - m.width - 2 : r.right + 2, top: r.top - 5 }));
        b.classList.add("mz-cmenu-open");
        b.setAttribute("aria-expanded", "true");
        sub = { el: s, btn: b };
      };
      // ほかの項目に乗ったら、開いている 2 段目を閉じる。2 段目を持つ項目は、乗るか押すと開く
      b.addEventListener("pointerenter", () => { if (it.sub) openSub(); else closeSub(); }, { signal });
      b.addEventListener("click", () => {
        if (it.sub) { openSub(); return; }
        close();
        it.run?.();
      }, { signal });
      li.appendChild(b);
      el.appendChild(li);
    }
    el.addEventListener("contextmenu", e => e.preventDefault(), { signal });
    document.body.appendChild(el);
    lists.push(el);
    // 画面の端からはみ出すなら、内側へ寄せる
    const r = el.getBoundingClientRect(), margin = 4, p = place(r);
    el.style.left = `${Math.max(margin, Math.min(p.left, window.innerWidth - r.width - margin))}px`;
    el.style.top = `${Math.max(margin, Math.min(p.top, window.innerHeight - r.height - margin))}px`;
    return el;
  }
  list(entries, () => ({ left: at.x, top: at.y }));

  // メニューの外を押す・Esc・スクロール・画面の大きさが変わる・ほかのウィンドウへ移ったら閉じる
  const inside = (t: EventTarget | null) => t instanceof Node && lists.some(l => l.contains(t));
  window.addEventListener("pointerdown", e => { if (!inside(e.target)) close(); }, { signal, capture: true });
  window.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }, { signal, capture: true });
  window.addEventListener("wheel", close, { signal, capture: true, passive: true });
  window.addEventListener("scroll", close, { signal, capture: true, passive: true });
  window.addEventListener("resize", close, { signal });
  window.addEventListener("blur", close, { signal });
  return close;
}
