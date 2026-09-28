// ポインタ操作: 移動のドラッグ、付け替えのドラッグ（ゴースト）、クリックでの選択、Esc。
// 図の状態の変更（選択、線、付け替え）は ctx の関数を呼んで graph.ts に任せる

import type { Drag, DragSession } from "./layout/drag";
import type { Layout } from "./layout/layout";
import { type Box, type World, ancestors, inNest, isInside, overflowOf, setSpec } from "./model";
import type { Renderer } from "./render";

// ドラッグの働き。移動か、親子の付け替えか
export type Mode = "move" | "reparent";

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
  // 付け替えのドラッグ。target は落とす先（null はワールド、undefined は落とせない場所）
  let lift: {
    n: Box; pointerId: number; sx: number; sy: number; offX: number; offY: number;
    ghost: HTMLElement | null; target: Box | null | undefined;
  } | null = null;

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
    const n = boxOf(e.target);
    if (!n) {
      if (!onEdge(e.target)) {
        ctx.cancelLinking();
        ctx.select(null);
      }
      return;
    }
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      ctx.ctrlClick(n);
      return;
    }
    if (ctx.current() !== n) ctx.select(n);
    if (ctx.mode() === "reparent") {
      const r = n.el.getBoundingClientRect();
      n.head.setPointerCapture(e.pointerId);
      lift = { n, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
        offX: e.clientX - r.left, offY: e.clientY - r.top, ghost: null, target: undefined };
      return;
    }
    const d = dragTarget(n);
    n.head.setPointerCapture(e.pointerId);
    drag = { n: d, sx: e.clientX, sy: e.clientY, ox: d.x, oy: d.y, moved: false, released: null, session: null };
    d.el.classList.add("mz-dragging");
    focus(n);
  }

  function onPointerMove(e: PointerEvent) {
    if (lift) return moveLift(e);
    if (!drag) return;
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

  function onPointerUp(e: PointerEvent) {
    if (lift) return dropLift(e);
    if (!drag) return;
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
    if (n) focus(n);
    else if (!onEdge(e.target)) unfocus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    ctx.cancelLinking();
    endLift();
  }

  // ---- 付け替えのドラッグ ----
  // つかんだボックスの半透明のコピー（ゴースト）をポインタに付けて動かし、下にある落とし先を強調する

  // ポインタの下の落とし先。自分と自分の子孫の上は落とせない（undefined）
  function dropTargetAt(x: number, y: number): Box | null | undefined {
    const r = container.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return undefined;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!container.contains(el)) continue;
      const head = el.closest(".mz-head");
      if (!head) continue;
      const b = boxOf(head);
      if (!b) continue;
      return isInside(b, lift!.n) ? undefined : b;
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
    if (!l.ghost) {
      if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 4) return; // クリックとドラッグを見分ける
      const g = l.n.el.cloneNode(true) as HTMLElement;
      g.classList.add("mz-ghost");
      g.classList.remove("mz-current", "mz-dim");
      container.appendChild(g);
      l.ghost = g;
      l.n.el.classList.add("mz-lifted");
      unfocus(); // ポインタを乗せたときの薄い表示を消し、落とし先を見やすくする
    }
    const r = container.getBoundingClientRect();
    l.ghost.style.left = e.clientX - l.offX - r.left + container.scrollLeft + "px";
    l.ghost.style.top = e.clientY - l.offY - r.top + container.scrollTop + "px";
    markTarget(dropTargetAt(e.clientX, e.clientY));
  }

  function endLift() {
    if (!lift) return;
    markTarget(undefined);
    lift.ghost?.remove();
    lift.n.el.classList.remove("mz-lifted");
    lift = null;
  }

  function dropLift(e: PointerEvent) {
    const l = lift!;
    const t = l.ghost ? l.target : undefined;
    // 新しい親の中での位置（ゴーストの左上）
    let at: { x: number; y: number } | undefined;
    if (t !== undefined) {
      const r = (t ?? world).el.getBoundingClientRect();
      at = { x: e.clientX - l.offX - r.left, y: e.clientY - l.offY - r.top };
    }
    const n = l.n;
    endLift();
    if (t !== undefined) ctx.reparent(n.id, t ? t.id : null, at);
  }

  // ---- 受け付けるイベント ----

  const listening = new AbortController();
  const signal = listening.signal;
  container.addEventListener("pointerdown", onPointerDown, { signal });
  container.addEventListener("pointermove", onPointerMove, { signal });
  container.addEventListener("pointerup", onPointerUp, { signal });
  container.addEventListener("pointercancel", onPointerUp, { signal });
  container.addEventListener("pointerover", onPointerOver, { signal });
  container.addEventListener("pointerleave", () => { if (!drag) unfocus(); }, { signal });
  document.addEventListener("keydown", onKeyDown, { signal });

  return {
    dragging: () => drag != null || lift != null,
    endLift,
    // 描き直すときに、移動のドラッグを忘れる
    reset() { drag = null; },
    destroy() { listening.abort(); },
  };
}
