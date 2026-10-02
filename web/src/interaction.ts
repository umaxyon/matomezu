// ポインタ操作: 移動のドラッグ、付け替えのドラッグ（ゴースト）、クリックでの選択、Esc。
// 図の状態の変更（選択、線、付け替え）は ctx の関数を呼んで graph.ts に任せる

import type { Drag, DragSession } from "./layout/drag";
import type { Layout } from "./layout/layout";
import { BEND_MARGIN, type Box, type Edge, type World, ancestors, inNest, isInside, overflowOf, setSpec } from "./model";
import type { Subtree } from "./pages";
import type { Renderer } from "./render";

// ツールのモード。移動、親子の付け替え、線（線のクリックで削除、Ctrl+クリックで線を引く。ドラッグは移動）、
// 削除（ボックスを押すと子孫ごと消える。ドラッグはしない）
export type Mode = "move" | "reparent" | "link" | "remove";

// サイドバーの一覧から、消したボックスを図へドラッグするときのデータの種類（中身は id）
export const REMOVED_MIME = "application/x-matomezu-removed";
// サイドバーの一覧から、ほかのブックの箱を図へドラッグして移植するときのデータの種類（中身は { copy: Subtree, from: ブック名 } の JSON）
export const COPY_MIME = "application/x-matomezu-copy";

// 動かし始めたときに外した、祖先の最小の大きさ（実際に動かさなければ戻す）
interface Released {
  m: Box;
  specW: number;
  specH: number;
  src: Box["src"]; // 外す前のデータ（項目の順番も戻すため、丸ごと写す）
}

export interface InteractionContext {
  container: HTMLElement;
  world: World;
  boxOfEl: WeakMap<Element, Box>; // 画面の要素からボックスを引く
  current(): Box | null;          // 選択中（null はワールド）
  mode(): Mode;
  select(n: Box | null): void;
  cancelLinking(): void;          // Ctrl+クリックで選んだ1つ目を取り消す
  ctrlClick(n: Box): void;        // 線を引く
  changed(): void;
  notifySelect(): void;
  reparent(id: string, parentId: string | null, at?: { x: number; y: number }): void;
  drop(n: Box): void;             // ドラッグ中に解決できなかった重なりを直す（場面の表の drop）
  remove(n: Box): void;           // 子孫ごと消す
  restore(id: string, parentId: string | null, at: { x: number; y: number }): void; // 消したボックスを戻す
  boxById(id: string): Box | undefined; // 今のページにある箱（無ければ undefined）
  edgeOfEl(el: Element): Edge | undefined;  // Z 字の中棒をつかむ要素の線
  setBend(e: Edge, bend: number): void;     // Z 字の中棒の位置を変えて描き直す
  paste(copy: Subtree, parentId: string | null, at: { x: number; y: number }, from?: string): void; // ほかのブックの箱を移植する
  liftOver(x: number, y: number): void; // 付け替えのドラッグ中のポインタの位置（画面の座標。タブへのドラッグに使う）
  liftEnd(): void;                      // 付け替えのドラッグが終わった
}

export function createInteraction(ctx: InteractionContext, L: Layout, R: Renderer, D: Drag) {
  const { container, world } = ctx;
  const { refitAncestors, syncWorld, centerX } = L;

  const { render, blocked, focus, unfocus } = R;

  let drag: {
    n: Box; sx: number; sy: number; ox: number; oy: number; moved: boolean;
    released: Released[] | null; // 動かし始めたときに外した、祖先の最小の大きさ
    session: DragSession | null; // 動かし始めたときの位置の写し
  } | null = null;
  // 付け替えのドラッグ。target は落とす先（null はワールド、undefined は落とせない場所）。
  // 運んでいる箱は id で覚える。途中でタブを切り替えてページを描き直すと、箱の要素は作り直される（ほかのページなら無くなる）ため。
  // 同じ理由で、ポインタは図の要素で捕まえず、ページ全体（document）で受け取る
  let lift: {
    id: string; pointerId: number; sx: number; sy: number; offX: number; offY: number;
    ghost: HTMLElement | null; target: Box | null | undefined; stop: AbortController;
  } | null = null;

  // Z 字の中棒のドラッグ（選択モード）。moved は実際に動かしたか
  let bendDrag: { e: Edge; pointerId: number; moved: boolean } | null = null;

  // 中棒のドラッグ中のポインタから、中棒の位置（向き合う辺の間の割合）を求める。両端の余白（BEND_MARGIN）より内側に収める
  function moveBend(ev: PointerEvent) {
    const b = bendDrag!;
    const span = b.e.span;
    if (!span || span.to === span.from) return;
    const r = world.el.getBoundingClientRect();
    const at = span.axis === "x" ? ev.clientX - r.left : ev.clientY - r.top;
    const len = Math.abs(span.to - span.from);
    const margin = Math.min(0.5, BEND_MARGIN / len);
    const ratio = Math.min(1 - margin, Math.max(margin, (at - span.from) / (span.to - span.from)));
    b.moved = true;
    ctx.setBend(b.e, Math.round(ratio * 1000) / 1000);
  }

  // ---- ポインタ操作 ----

  function boxOf(target: EventTarget | null): Box | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest(".mz-node");
    return el && container.contains(el) ? ctx.boxOfEl.get(el) ?? null : null;
  }

  const onEdge = (target: EventTarget | null) => target instanceof Element && !!target.closest(".mz-edge");

  // ツリーの子は自分では動かず、ツリー全体（内包されている祖先）を動かす
  function dragTarget(n: Box): Box {
    let m = n;
    while (!inNest(m) && m.parent) m = m.parent;
    return m;
  }

  function onPointerDown(e: PointerEvent) {
    const handle = e.target instanceof Element ? e.target.closest(".mz-bend") : null;
    const bent = handle && ctx.mode() === "move" ? ctx.edgeOfEl(handle) : undefined;
    if (bent?.span) {
      e.stopPropagation();
      handle!.setPointerCapture(e.pointerId);
      bendDrag = { e: bent, pointerId: e.pointerId, moved: false };
      return;
    }
    const n = boxOf(e.target);
    if (!n) {
      if (!onEdge(e.target)) {
        ctx.cancelLinking();
        ctx.select(null);
      }
      return;
    }
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && ctx.mode() === "link") {
      e.preventDefault();
      ctx.ctrlClick(n);
      return;
    }
    if (ctx.mode() === "remove") {
      e.preventDefault();
      unmarkRemove();
      ctx.remove(n);
      return;
    }
    if (ctx.current() !== n) ctx.select(n);
    if (ctx.mode() === "reparent") {
      const r = n.el.getBoundingClientRect();
      e.preventDefault(); // 文字の選択を始めない（ポインタを図の要素で捕まえないため）
      const stop = new AbortController();
      lift = { id: n.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
        offX: e.clientX - r.left, offY: e.clientY - r.top, ghost: null, target: undefined, stop };
      const mine = (ev: PointerEvent) => lift != null && ev.pointerId === lift.pointerId;
      document.addEventListener("pointermove", ev => { if (mine(ev)) moveLift(ev); }, { signal: stop.signal });
      document.addEventListener("pointerup", ev => { if (mine(ev)) dropLift(ev); }, { signal: stop.signal });
      document.addEventListener("pointercancel", ev => { if (mine(ev)) endLift(); }, { signal: stop.signal });
      return;
    }
    const d = dragTarget(n);
    n.head.setPointerCapture(e.pointerId);
    drag = { n: d, sx: e.clientX, sy: e.clientY, ox: d.x, oy: d.y, moved: false, released: null, session: null };
    d.el.classList.add("mz-dragging");
    focus(n);
  }

  function onPointerMove(e: PointerEvent) {
    if (bendDrag) return moveBend(e);
    if (lift || !drag) return; // 付け替えのドラッグはページ全体で受け取っている
    const { n } = drag;
    if (e.clientX === drag.sx && e.clientY === drag.sy && !drag.released) return; // まだ動いていない
    drag.released ??= releaseSizes(n);
    drag.session ??= D.begin(n);
    // 置けない位置（広がった祖先が親の枠からはみ出す）なら、置ける所で止めて知らせる
    const reached = drag.session.compute(drag.ox + e.clientX - drag.sx, drag.oy + e.clientY - drag.sy);
    if (n.x !== drag.ox || n.y !== drag.oy) drag.moved = true;
    n.intendedY = n.y; // 手で置いた位置が、本来いたい位置になる
    n.intendedCX = centerX(n);
    render();
    if (!reached) blocked(n);
  }

  function onPointerUp() {
    if (bendDrag) {
      if (bendDrag.moved) ctx.changed();
      bendDrag = null;
      return;
    }
    if (lift || !drag) return;
    const { n, moved, session } = drag;
    n.el.classList.remove("mz-dragging");
    if (!moved && drag.released) restoreSizes(drag.released, n);
    drag = null;
    unfocus();
    if (moved && session) {
      // 手を離したときの位置で確定する。どいた箱は、どいた先が本来いたい位置になる
      // （離れても戻さない。2026-09-28 にユーザーと決めた。docs/LAYOUT-PENDING.md の 6）
      session.finish();
      n.intendedY = n.y;
      n.intendedCX = centerX(n);
      for (const b of session.displaced()) { b.intendedY = b.y; b.intendedCX = centerX(b); }
      if (session.overlapping()) ctx.drop(n);
      else render();
      syncWorld();
      ctx.changed();
      ctx.notifySelect();
    }
  }

  // 中身を手で動かしたら、中身に合わせて伸びる祖先の最小の大きさ（width, height）を外し、中身に追従させる。
  // 「子のサイズをそろえる」で付いた大きさも、手で動かした方を優先する。
  // 幅に合わせて折り返す・切り詰めるグループは、大きさを意図して決めているので外さない
  function releaseSizes(n: Box): Released[] {
    const out: Released[] = [];
    for (const m of ancestors(n)) {
      if (overflowOf(m) !== "grow" || !(m.specW || m.specH)) continue;
      out.push({ m, specW: m.specW, specH: m.specH, src: { ...m.src } });
      setSpec(m, "w", 0);
      setSpec(m, "h", 0);
    }
    return out;
  }

  // 実際には動かさなかったときは、外した大きさを戻す
  function restoreSizes(list: Released[], n: Box) {
    for (const r of list) {
      r.m.specW = r.specW;
      r.m.specH = r.specH;
      // データの入れ物は図全体から参照されているので、入れ替えずに中身を戻す
      for (const k of Object.keys(r.m.src)) delete r.m.src[k as keyof Box["src"]];
      Object.assign(r.m.src, r.src);
    }
    refitAncestors(n);
    render();
  }

  function onPointerOver(e: PointerEvent) {
    if (drag || lift) return;
    const n = boxOf(e.target);
    if (ctx.mode() === "remove") return markRemove(n);
    if (n) focus(n);
    else if (!onEdge(e.target)) unfocus();
  }

  // 削除モードでポインタを乗せたボックスに、一緒に消える範囲（子孫を含む）を示す印を付ける
  let removing: Box | null = null;
  function markRemove(n: Box | null) {
    if (removing === n) return;
    unmarkRemove();
    removing = n;
    n?.el.classList.add("mz-removing");
  }
  function unmarkRemove() {
    removing?.el.classList.remove("mz-removing");
    removing = null;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    ctx.cancelLinking();
    endLift();
  }

  // ---- 付け替えのドラッグ ----
  // つかんだボックスの半透明のコピー（ゴースト）をポインタに付けて動かし、下にある落とし先を強調する

  // ポインタの下の落とし先。moving（動かしているボックス）と、その子孫の上は落とせない（undefined）。
  // ページの箱の上も落とせない（中身は別のページにあり、落とすと見えなくなるため。docs/TABS-plan.md）
  function dropTargetAt(x: number, y: number, moving: Box | null): Box | null | undefined {
    const r = container.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return undefined;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!container.contains(el)) continue;
      const head = el.closest(".mz-head");
      if (!head) continue;
      const b = boxOf(head);
      if (!b) continue;
      if (b.src.page === true) return undefined;
      return moving && isInside(b, moving) ? undefined : b;
    }
    return null;
  }

  function markTarget(t: Box | null | undefined) {
    if (!lift) return;
    if (lift.target !== undefined) (lift.target ?? world).el.classList.remove("mz-drop");
    lift.target = t;
    if (t !== undefined) (t ?? world).el.classList.add("mz-drop");
    lift.ghost?.classList.toggle("mz-ghost-no", t === undefined);
  }

  function moveLift(e: PointerEvent) {
    const l = lift!;
    const n = ctx.boxById(l.id); // 今のページに無ければ undefined（タブを切り替えてほかのページを描いているとき）
    if (!l.ghost) {
      if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 4) return; // クリックとドラッグを見分ける
      if (!n) return;
      const g = n.el.cloneNode(true) as HTMLElement;
      g.classList.add("mz-ghost");
      g.classList.remove("mz-current", "mz-dim");
      container.appendChild(g);
      l.ghost = g;
      unfocus(); // ポインタを乗せたときの薄い表示を消し、落とし先を見やすくする
    }
    n?.el.classList.add("mz-lifted"); // 描き直しで作られた要素にも付ける
    l.ghost.style.left = e.clientX - l.offX + "px";
    l.ghost.style.top = e.clientY - l.offY + "px";
    markTarget(dropTargetAt(e.clientX, e.clientY, n ?? null));
    ctx.liftOver(e.clientX, e.clientY);
  }

  function endLift() {
    if (!lift) return;
    markTarget(undefined);
    lift.ghost?.remove();
    ctx.boxById(lift.id)?.el.classList.remove("mz-lifted");
    lift.stop.abort();
    lift = null;
    ctx.liftEnd();
  }

  function dropLift(e: PointerEvent) {
    const l = lift!;
    // 落とす直前に、ポインタの下を見直す（タブの切り替えで描き直したあと、まだ動かしていないこともある）
    const t = l.ghost ? dropTargetAt(e.clientX, e.clientY, ctx.boxById(l.id) ?? null) : undefined;
    // 新しい親の中での位置（ゴーストの左上）
    let at: { x: number; y: number } | undefined;
    if (t !== undefined) {
      const r = (t ?? world).el.getBoundingClientRect();
      at = { x: e.clientX - l.offX - r.left, y: e.clientY - l.offY - r.top };
    }
    const id = l.id;
    endLift();
    if (t !== undefined) ctx.reparent(id, t ? t.id : null, at);
  }

  // ---- 消したボックスを一覧から戻す（HTML のドラッグ＆ドロップ） ----
  // 落とし先の判定は付け替えと同じ。落とした位置（ポインタの少し左上）を、落とし先の中での左上にする

  let restoreTarget: Box | null | undefined;
  function markRestore(t: Box | null | undefined) {
    if (restoreTarget !== undefined) (restoreTarget ?? world).el.classList.remove("mz-drop");
    restoreTarget = t;
    if (t !== undefined) (t ?? world).el.classList.add("mz-drop");
  }
  const carriesRemoved = (e: DragEvent) => !!e.dataTransfer?.types.includes(REMOVED_MIME);
  const carriesCopy = (e: DragEvent) => !!e.dataTransfer?.types.includes(COPY_MIME);

  function onDragOver(e: DragEvent) {
    if (!carriesRemoved(e) && !carriesCopy(e)) return;
    const t = dropTargetAt(e.clientX, e.clientY, null);
    markRestore(t);
    if (t === undefined) return;
    e.preventDefault(); // 落とせることを知らせる
    e.dataTransfer!.dropEffect = carriesCopy(e) ? "copy" : "move";
  }

  function onDrop(e: DragEvent) {
    if (!carriesRemoved(e) && !carriesCopy(e)) return;
    e.preventDefault();
    const t = dropTargetAt(e.clientX, e.clientY, null);
    markRestore(undefined);
    if (t === undefined) return;
    const r = (t ?? world).el.getBoundingClientRect();
    const at = { x: e.clientX - r.left - 16, y: e.clientY - r.top - 12 };
    if (carriesCopy(e)) {
      let payload: { copy: Subtree; from?: string };
      try {
        payload = JSON.parse(e.dataTransfer!.getData(COPY_MIME));
      } catch {
        return;
      }
      ctx.paste(payload.copy, t ? t.id : null, at, payload.from);
      return;
    }
    const id = e.dataTransfer!.getData(REMOVED_MIME);
    if (id) ctx.restore(id, t ? t.id : null, at);
  }

  // ---- 受け付けるイベント ----

  const listening = new AbortController();
  const signal = listening.signal;
  container.addEventListener("pointerdown", onPointerDown, { signal });
  container.addEventListener("pointermove", onPointerMove, { signal });
  container.addEventListener("pointerup", onPointerUp, { signal });
  container.addEventListener("pointercancel", onPointerUp, { signal });
  container.addEventListener("pointerover", onPointerOver, { signal });
  container.addEventListener("pointerleave", () => { if (!drag) unfocus(); unmarkRemove(); }, { signal });
  container.addEventListener("dragover", onDragOver, { signal });
  container.addEventListener("dragleave", e => {
    if (!(e.relatedTarget instanceof Node && container.contains(e.relatedTarget))) markRestore(undefined);
  }, { signal });
  container.addEventListener("drop", onDrop, { signal });
  document.addEventListener("keydown", onKeyDown, { signal });

  return {
    dragging: () => drag != null || lift != null || bendDrag != null,
    endLift,
    // 描き直すときに、移動のドラッグと削除の印を忘れる。付け替えのドラッグは続ける（落とし先は描き直した要素で探し直す）
    reset() { drag = null; bendDrag = null; removing = null; if (lift) lift.target = undefined; },
    unmarkRemove,
    destroy() { lift?.stop.abort(); listening.abort(); },
  };
}
