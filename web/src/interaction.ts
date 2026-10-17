// ポインタ操作: ドラッグ（箱の移動、リストの並べ替え、線のキャプション・途中の区間・端、線を引く〇、付け替えのゴースト）、
// クリックでの選択、Esc、一覧からのドロップ（戻す・移植）。
// 進行中のドラッグは active の 1 つだけで持つ（種類ごとの中身は Gesture。docs/REFACTOR-2.md）。
// 図の状態の変更（選択、線、付け替え）は ctx の関数を呼んで graph.ts に任せる

import type { EdgeDrag } from "./edge-drag";
import type { Drag, DragSession } from "./layout/drag";
import type { Layout } from "./layout/layout";
import { classAnchors, memberNames, memberY } from "./classbox";
import { SVGNS } from "./dom";
import {
  type Box, type Edge, type World, abilitiesOf, acceptsKid, isInside, isLinkBox, leafLike, strategyOf,
} from "./model";
import { clientToIn, inToClient, toWorldLength, viewRectOf } from "./viewport";
import type { Subtree } from "./pages";
import type { Renderer } from "./render";
import { vertexAt } from "./routing";
import { shapeIcon } from "./shape-icons";
import type { Shape, Size } from "./types";
import { DEFAULT_SHAPE } from "./shapes";

// ツールのモード。選択（ドラッグで移動、箱の〇から線を引く。docs/EDGE-TOOL-plan.md）、親子の付け替え、
// 削除（ボックスを押すと子孫ごと消える。ドラッグはしない）、追加（押した所に新しい箱を足す。docs/ADD-plan.md）
export type Mode = "move" | "reparent" | "remove" | "add" | "pan"; // pan は手のひら（見る範囲を動かすだけ。D32）

// 追加モードで押した所: 新しい箱の親（null はワールド）、親の中での位置、リストへの差し込みなら前に入れる兄弟（無ければ末尾）
export interface AddRequest {
  parentId: string | null;
  at?: { x: number; y: number };
  before?: string;
  shape?: Shape; // 追加モードに入ったときに選んだ形とサイズ（道具入れの道具。無ければボックス・M。graph.startAdd）
  size?: Size;
}

// サイドバーの一覧から、消したボックスを図へドラッグするときのデータの種類（中身は id）
export const REMOVED_MIME = "application/x-matomezu-removed";
// サイドバーの一覧から、ほかのブックの箱を図へドラッグして移植するときのデータの種類（中身は { copy: Subtree, from: ブック名 } の JSON）
export const COPY_MIME = "application/x-matomezu-copy";
// 足す箱の左上は、ポインタのこれだけ左上（追加モードの影・一覧から戻すとき・ワールドを選んで貼り付けるとき。graph.ts）
export const ADD_OFFSET = { x: 16, y: 12 };

// 箱をドラッグして図の端へ寄せたときのスクロール。端からこれだけの内側（px）に入ったら動き出し、端に近いほど速く、
// 端を越えたら一番速く（毎秒 EDGE_SCROLL_MAX px）。図の外へ箱を運んで、図を広げられるように（残課題 E8）。
// 速さは時間で決める（画面の書き換えの回数によらない）。入り口では遅く、端へ寄せるほど速くなるよう、深さの 2 乗で上げる
// （2026-10-12 ユーザー: 1 コマあたり 24px では速すぎた）
const EDGE_SCROLL_ZONE = 48;
const EDGE_SCROLL_MAX = 600;

export interface InteractionContext {
  container: HTMLElement;
  world: World;
  boxOfEl: WeakMap<Element, Box>; // 画面の要素からボックスを引く
  current(): Box | null;          // 選択中（null はワールド）
  mode(): Mode;
  select(n: Box | null): void;
  canLink(a: Box, b: Box): boolean; // a から b へ線を引けるか（同じ箱なら自分に戻る線）
  link(a: Box, b: Box, at: [number, number] | undefined, from: [number, number], members?: { from?: string; to?: string }): boolean; // a から b へ線を引き、端を固定する。at は離した所（相手の子の上なら undefined）、from は引き始めた〇の辺の真ん中（ワールドの座標）。members はクラスの箱の、つなぐ属性・操作の名前
  canReconnect(e: Edge, end: "exit" | "enter", to: Box): boolean; // 線 e の端を箱 to につなぎ替えられるか（残課題 E12）
  reconnect(e: Edge, end: "exit" | "enter", to: Box, at: [number, number]): boolean; // 線 e の端を箱 to につなぎ替え、離した所 at の近くに固定する
  changed(): void;
  notifySelect(): void;
  reparent(id: string, parentId: string | null, at?: { x: number; y: number }): void;
  drop(n: Box): void;             // ドラッグ中に解決できなかった重なりを直す（場面の表の drop）
  remove(n: Box): void;           // 子孫ごと消す
  openLink(n: Box): void;         // リンクの箱の窓を押した（そのページを開く。link-box.ts）
  restore(id: string, parentId: string | null, at: { x: number; y: number }): void; // 消したボックスを戻す
  boxById(id: string): Box | undefined; // 今のページにある箱（無ければ undefined）
  edgeOfEl(el: Element): Edge | undefined;  // 線の部品（札・区間・端）の要素から、その線を引く
  edgeDrag: EdgeDrag;                       // 線の区間・端・キャプションのドラッグの中身（edge-drag.ts）
  paste(copy: Subtree, parentId: string | null, at: { x: number; y: number }, from?: string): void; // ほかのブックの箱を移植する
  liftOver(x: number, y: number): void; // 付け替えのドラッグ中のポインタの位置（画面の座標。タブへのドラッグに使う）
  liftEnd(): void;                      // 付け替えのドラッグが終わった
  reorder(n: Box, index: number): void; // リストの子 n を、兄弟の中で index 番目へ移して並べ直す（データの並び順も）
  resetRoutes(boxes: Box[], passive?: Box[], grabbed?: Box | null): void; // これらの箱につながる線の、自由な端を前に描いた辺の記憶を捨てる（一番よい形を追わせる）。passive は押し出された箱（grabbed との線は除く）
  settleRoutes(n: Box): void;           // 手を離した: つかんだ箱の線で、粘った形が一番よい形より明らかに悪ければ付け替える
  requestAdd(req: AddRequest): void;    // 追加モードで押した（新しい箱の中身を聞くのは画面の側。view.ts）
  addShape(): Shape;                    // 追加モードで足す形（影に絵を付ける）
  leaveAdd(): void;                     // 追加モードを Esc でやめる（選択モードに戻す）
  // 本文の幅を変え始める。width は今の本文の幅（箱の幅として数えたもの）。set で変え、finish で 1 件の履歴に、cancel で元に戻す
  resizeBody(n: Box): { width: number; set(w: number): void; finish(): void; cancel(): void };
  // リストの幅を変え始める（width は今のリストの幅。形は resizeBody と同じ。docs/SIZE-plan.md の 10 章）
  resizeList(n: Box): { width: number; set(w: number): void; finish(): void; cancel(): void };
  // スクロールにしたリストの高さの上限を変え始める（width は今の高さ。D33）
  resizeListHeight(n: Box): { width: number; set(h: number): void; finish(): void; cancel(): void };
  zoom(): number; // ワールドにかけている倍率（transform: scale。D32）。画面の上の差分を、これで割るとワールドの座標の差分になる
}

export function createInteraction(ctx: InteractionContext, L: Layout, R: Renderer, D: Drag) {
  const { container, world } = ctx;
  const { syncWorld, holdWorld, stretchWorld, centerX } = L;

  const { render, blocked, focus, unfocus } = R;
  // 画面の上の長さ（px）を、ワールドの座標の長さにする（倍率をかけていれば割り戻す。D32）
  const unscale = (v: number) => toWorldLength(ctx.zoom(), v);

  // ---- 進行中のドラッグ ----
  // どの種類も同じ形にする。押したときに種類ごとの関数が作って active に入れる。
  // dragging() と reset() は active だけを見るので、種類を足しても数え上げの漏れが起きない
  interface Gesture {
    kind: "move" | "reorder" | "caption" | "lift" | "bend" | "end" | "body" | "link" | "open";
    slop: number;                 // 遊び（px）。押した所から動いた量がこれ以上になるまで move を呼ばない
    move(ev: PointerEvent): void;
    end(ev: PointerEvent): void;  // 手を離した
    cancel(): void;               // 描き直すときに打ち切る（付け替えは打ち切らず、落とし先だけ忘れる）
  }
  let active: { g: Gesture; sx: number; sy: number; started: boolean } | null = null;
  const begin = (g: Gesture, ev: PointerEvent) => {
    hidePorts();
    active = { g, sx: ev.clientX, sy: ev.clientY, started: false };
  };

  // 付け替えのドラッグ。target は落とす先（null はワールド、undefined は落とせない場所）。
  // 運んでいる箱は id で覚える。途中でタブを切り替えてページを描き直すと、箱の要素は作り直される（ほかのページなら無くなる）ため。
  // 同じ理由で、ポインタは図の要素で捕まえず、ページ全体（document）で受け取る
  let lift: {
    id: string; pointerId: number; sx: number; sy: number; offX: number; offY: number;
    ghost: HTMLElement | null; target: Box | null | undefined; stop: AbortController;
  } | null = null;

  // ポインタの位置（ワールドの座標）
  const worldAt = (ev: PointerEvent): [number, number] => clientToIn(world.el, ctx.zoom(), ev.clientX, ev.clientY);

  // 折れ線の途中の区間のドラッグ（選択モード）。index は区間の番号（via の何番目か）。
  // ポインタの位置へ区間を動かす。動ける範囲は graph の側で収める
  function bendGesture(e: Edge, index: number): Gesture {
    let moved = false;
    return {
      kind: "bend", slop: 0,
      move(ev) {
        const seg = e.segments.find(s => s.index === index);
        if (!seg) return;
        moved = true;
        const [x, y] = worldAt(ev);
        ctx.edgeDrag.setVia(e, index, seg.axis === "x" ? x : y);
      },
      end() { if (moved) ctx.edgeDrag.endVia(e); },
      cancel() {},
    };
  }

  // 線の端のドラッグ（選択モードで線を選んでいるとき）。今の箱の上や何も無い所では、端を今の箱の縁に沿って動かす。
  // ほかの箱の上へ運ぶと、その箱（から外へたどって最初に付け替えられる箱）を相手として強調し、離すとそこへつなぎ替える（残課題 E12）。
  // 付け替えられる箱のほかは薄くする（線を引くときと同じ）
  function endGesture(e: Edge, end: "exit" | "enter"): Gesture {
    let moved = false;
    const own = end === "exit" ? e.a : e.b, other = end === "exit" ? e.b : e.a;
    const siblings = other.parent ? other.parent.children : world.children;
    const can = new Set(siblings.filter(o => ctx.canReconnect(e, end, o)));
    let target: Box | null = null;
    const mark = (t: Box | null) => {
      if (t === target) return;
      target?.el.classList.remove("mz-link-target");
      target = t;
      t?.el.classList.add("mz-link-target");
    };
    // ポインタの下の、付け替えられる箱（今の箱の上なら null）。付け替えられる箱が無ければ探さない
    const targetAt = (x: number, y: number): Box | null => {
      if (!can.size) return null;
      for (const el of document.elementsFromPoint(x, y)) {
        if (!container.contains(el) || !el.closest(".mz-node")) continue;
        for (let b: Box | null = boxOf(el); b; b = b.parent) {
          if (b === own) return null;
          if (can.has(b)) return b;
        }
        return null;
      }
      return null;
    };
    const finish = () => { mark(null); ctx.edgeDrag.endAt(); unfocus(); };
    return {
      kind: "end", slop: 0,
      move(ev) {
        if (!moved && can.size) dimExcept(new Set([...can, own]));
        moved = true;
        mark(targetAt(ev.clientX, ev.clientY));
        if (!target) ctx.edgeDrag.setAt(e, end, ...worldAt(ev));
        else ctx.edgeDrag.endAt(); // 吸着の目印を消す
      },
      end(ev) {
        const t = target;
        finish();
        if (t) ctx.reconnect(e, end, t, worldAt(ev));
        else if (moved) ctx.changed();
      },
      cancel: finish,
    };
  }

  // 線のキャプションの札のドラッグ。少し動かしてから動かし始める（押してすぐ離すのは、線を選ぶクリック）
  function captionGesture(e: Edge): Gesture {
    let moved = false;
    return {
      kind: "caption", slop: 3,
      move(ev) {
        moved = true;
        ctx.edgeDrag.setCaptionAt(e, ...worldAt(ev));
      },
      end() { if (moved) ctx.changed(); },
      cancel() {},
    };
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
    while (!abilitiesOf(m).drag && m.parent) m = m.parent;
    return m;
  }

  function onPointerDown(e: PointerEvent) {
    // 線を引く〇（選択モードで、ポインタを乗せた箱に出す）
    const port = e.target instanceof Element ? e.target.closest<HTMLElement>(".mz-port") : null;
    if (port) {
      e.stopPropagation();
      e.preventDefault();
      if (portBox && ctx.mode() === "move") {
        const from = portBox, side = port.dataset.side as Side;
        port.setPointerCapture?.(e.pointerId); // 〇は出したまま（捕まえた要素を隠すと、ポインタを見失う）
        begin(linkGesture(from, side, port, port.dataset.member), e);
      }
      return;
    }
    // 追加モード: 押した所に新しい箱を足す（ほかの操作はしない）
    if (ctx.mode() === "add") {
      e.stopPropagation();
      e.preventDefault();
      const spot = addSpotAt(e.clientX, e.clientY);
      if (spot) ctx.requestAdd(spot);
      return;
    }
    // 線のキャプションの札をつまむと、線に沿って・線から離して動かす（選択モード。押してすぐ離せば、札のクリックで線を選ぶ）
    const labelEl = e.target instanceof Element ? e.target.closest(".mz-label") : null;
    const labelEdge = labelEl && ctx.mode() === "move" ? ctx.edgeOfEl(labelEl) : undefined;
    if (labelEdge) {
      e.stopPropagation();
      // ポインタを捕まえる（図の外で離しても pointerup が届き、ドラッグが残らないように）
      (e.target as Element).setPointerCapture?.(e.pointerId);
      begin(captionGesture(labelEdge), e);
      return;
    }
    const endEl = e.target instanceof Element ? e.target.closest<SVGElement>(".mz-end") : null;
    const endEdge = endEl && ctx.mode() === "move" ? ctx.edgeOfEl(endEl) : undefined;
    if (endEdge?.ends) {
      e.stopPropagation();
      endEl!.setPointerCapture(e.pointerId);
      begin(endGesture(endEdge, endEl!.dataset.end === "enter" ? "enter" : "exit"), e);
      return;
    }
    const handle = e.target instanceof Element ? e.target.closest<SVGElement>(".mz-bend") : null;
    const bent = handle && ctx.mode() === "move" ? ctx.edgeOfEl(handle) : undefined;
    if (bent && handle!.dataset.index != null) {
      e.stopPropagation();
      handle!.setPointerCapture(e.pointerId);
      begin(bendGesture(bent, Number(handle!.dataset.index)), e);
      return;
    }
    // 本文の幅のつまみ（docs/BODY-plan.md）と、リストの幅のつまみ（docs/SIZE-plan.md の 10 章）。選択モードで、選んでいる箱だけ出す
    // スクロールにしたリストの高さの上限のつまみ（下の縁。D33）は縦に動かす
    const grip = e.target instanceof Element ? e.target.closest<HTMLElement>(".mz-body-grip, .mz-width-grip, .mz-height-grip") : null;
    const gripBox = grip && ctx.mode() === "move" ? boxOf(grip) : undefined;
    if (gripBox) {
      e.stopPropagation();
      e.preventDefault();
      grip!.setPointerCapture?.(e.pointerId);
      const tall = grip!.classList.contains("mz-height-grip");
      const r = tall ? ctx.resizeListHeight(gripBox) : grip!.classList.contains("mz-width-grip") ? ctx.resizeList(gripBox) : ctx.resizeBody(gripBox);
      begin(resizeGesture(r, e, tall ? "y" : "x"), e);
      return;
    }
    const n = boxOf(e.target);
    if (!n) {
      if (!onEdge(e.target)) ctx.select(null);
      return;
    }
    e.stopPropagation();
    hidePorts(); // 選んだ箱には〇を出さない（右の縁の本文の幅のつまみと重なるため）
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
      // 付け替えは図の要素で捕まえず、ページ全体で受け取る（下）。active には「ドラッグ中」と数えるために入れる
      begin({ kind: "lift", slop: 0, move() {}, end() {}, cancel() { if (lift) lift.target = undefined; } }, e);
      const mine = (ev: PointerEvent) => lift != null && ev.pointerId === lift.pointerId;
      document.addEventListener("pointermove", ev => { if (mine(ev)) moveLift(ev); }, { signal: stop.signal });
      document.addEventListener("pointerup", ev => { if (mine(ev)) dropLift(ev); }, { signal: stop.signal });
      document.addEventListener("pointercancel", ev => { if (mine(ev)) endLift(); }, { signal: stop.signal });
      return;
    }
    // リンクの箱の窓（link-box.ts）: 押してそのまま離せば、のぞいているページを開く。窓からはドラッグしない（持ち手と文字の所でつかむ）
    // 縮図だけの行（リストの子の中身の縮図。D13）は開く先が無いので、ふつうの箱と同じにつかむ
    if (isLinkBox(n) && e.target instanceof Element && e.target.closest(".mz-link-win")) {
      e.preventDefault();
      n.head.setPointerCapture(e.pointerId);
      begin(openGesture(n), e);
      return;
    }
    if (abilitiesOf(n).reorder) {
      n.head.setPointerCapture(e.pointerId);
      begin(reorderGesture(n, e), e);
      return;
    }
    const d = dragTarget(n);
    n.head.setPointerCapture(e.pointerId);
    begin(moveGesture(d, e), e);
    focus(n);
  }

  // 本文の幅かリストの幅を、つまみを動かした分だけ変え、周りは押しのける（手を離したら確定。r は ctx.resizeBody か ctx.resizeList）
  function resizeGesture(r: ReturnType<InteractionContext["resizeBody"]>, down: PointerEvent, axis: "x" | "y" = "x"): Gesture {
    let moved = false;
    return {
      kind: "body", slop: 0,
      move(ev) {
        moved = true;
        r.set(r.width + unscale(axis === "x" ? ev.clientX - down.clientX : ev.clientY - down.clientY));
      },
      end() { if (moved) r.finish(); },
      cancel() { r.cancel(); },
    };
  }

  // リストの子の並べ替え（docs/LIST-plan.md）。つかんだ子はポインタに付いてくる（見た目だけずらす）。
  // つかんだ子の上端がいたい位置（親の中）から入る順番を決め、変われば並べ直す（中心がほかの子の中心を越えたら入れ替わる）
  // スクロールにしたリスト（D33）では、上下の端へ寄せると中をスクロールし、スクロールした分だけつかんだ子も進む
  function reorderGesture(n: Box, down: PointerEvent): Gesture {
    const sy = down.clientY, oy = n.y;
    const scroller = () => n.parent?.kidsEl ?? null;
    const s0 = scroller()?.scrollTop ?? 0;
    const listScroll = edgeScroller(scroller);
    let moved = false;
    n.el.classList.add("mz-dragging");
    return {
      kind: "reorder", slop: 0,
      move(ev) {
        const p = n.parent!;
        if (p.kidsEl) {
          // 縦だけ（横は、リストの真ん中にいることにする）
          const r = p.kidsEl.getBoundingClientRect();
          listScroll.follow({ clientX: r.left + r.width / 2, clientY: ev.clientY }, () => this.move(ev));
        }
        let y = oy + unscale(ev.clientY - sy) + ((p.kidsEl?.scrollTop ?? 0) - s0);
        // スクロールするリストでは、つかんだ子の真ん中を中身の範囲から出さない（ずらした分だけ中身が伸びて、スクロールが止まらなくなるため。
        // 真ん中が端まで行ければ、先頭にも末尾にも入れられる）
        if (p.kidsEl) {
          const others = p.children.filter(k => k !== n);
          if (others.length) y = Math.max(Math.min(...others.map(k => k.y)) - n.h / 2, Math.min(y, Math.max(...others.map(k => k.y + k.h)) - n.h / 2));
        }
        const mid = y + n.h / 2;
        const index = p.children.filter(k => k !== n && k.y + k.h / 2 < mid).length;
        if (index !== p.children.indexOf(n)) {
          ctx.reorder(n, index);
          moved = true;
        }
        n.el.style.translate = `0 ${y - n.y}px`;
      },
      end() {
        listScroll.stop();
        n.el.style.translate = "";
        n.el.classList.remove("mz-dragging");
        if (!moved) return;
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() { listScroll.stop(); },
    };
  }

  // 箱の移動（選択モード）。n はつかんだ箱（ツリーの子なら、ツリー全体）
  // リンクの箱の窓を押した。遊びの分より動かさずに離せば開く（動かしたら何もしない）
  function openGesture(n: Box): Gesture {
    let moved = false;
    return {
      kind: "open", slop: 4,
      move() { moved = true; },
      end() { if (!moved) ctx.openLink(n); },
      cancel() { moved = true; },
    };
  }

  function moveGesture(n: Box, down: PointerEvent): Gesture {
    const sx = down.clientX, sy = down.clientY, ox = n.x, oy = n.y;
    const sl = container.scrollLeft, st = container.scrollTop; // 動かしている間に図をスクロールした分も、箱を動かす
    let moved = false;
    let started = false;
    let session: DragSession | null = null; // 動かし始めたときの位置の写し
    let swapped: Box[] = [];                // 入れ替えた兄弟
    const fresh = new Set<Box>();           // 入れ替えが起きた箱（このドラッグの終わりまで、線は粘らずに一番よい形を追う。docs/EDGE-SPEC.md の A2・A3）
    n.el.classList.add("mz-dragging");
    return {
      kind: "move", slop: 0,
      move(ev) {
        if (ev.clientX === sx && ev.clientY === sy && !started) return; // まだ動いていない
        if (!started) holdWorld(true); // 動かしている間は図を縮めない（手を離したら縮める）
        started = true;
        session ??= D.begin(n);
        // 置けない位置（広がった祖先が親の枠からはみ出す）なら、置ける所で止めて知らせる
        const reached = session.compute(ox + unscale(ev.clientX - sx + container.scrollLeft - sl), oy + unscale(ev.clientY - sy + container.scrollTop - st));
        const now = session.swapped();
        if (now.length !== swapped.length || now.some(o => !swapped.includes(o))) {
          for (const o of [n, ...now, ...swapped]) fresh.add(o);
          swapped = [...now];
        }
        // 押し出された箱の線も、粘らずに一番よい形を追う（A5）
        ctx.resetRoutes([...fresh], session.displaced(), n);
        if (n.x !== ox || n.y !== oy) moved = true;
        n.intendedY = n.y; // 手で置いた位置が、本来いたい位置になる
        n.intendedCX = centerX(n);
        render();
        syncWorld(); // 図の端へ寄せたら、図を広げてその先へスクロールできるようにする
        if (!reached) blocked(n);
        edgeScroll.follow(ev, () => this.move(ev));
      },
      end() {
        edgeScroll.stop();
        n.el.classList.remove("mz-dragging");
        unfocus();
        if (started) holdWorld(false);
        if (!moved || !session) return;
        // 手を離したときの位置で確定する。どいた箱は、どいた先が本来いたい位置になる
        // （離れても戻さない。2026-09-28 にユーザーと決めた。docs/LAYOUT-PENDING.md の 6）
        session.finish();
        ctx.settleRoutes(n);
        n.intendedY = n.y;
        n.intendedCX = centerX(n);
        for (const b of session.displaced()) { b.intendedY = b.y; b.intendedCX = centerX(b); }
        if (session.overlapping()) ctx.drop(n);
        else render();
        syncWorld();
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() { edgeScroll.stop(); if (started) holdWorld(false); },
    };
  }

  // 箱を図の見えている範囲の端（EDGE_SCROLL_ZONE の内側か外）へ寄せている間、その向きへ図をスクロールし続ける。
  // スクロールするたびに again を呼ぶ（箱をスクロールした分だけ動かし、図を広げる）。ポインタを動かさなくても続く
  const edgeScroll = edgeScroller(() => container);

  // el の見えている範囲の端へ寄せている間、その向きへ el をスクロールし続ける（図の枠と、スクロールにしたリストの中。D33）。
  // 帯の幅は EDGE_SCROLL_ZONE（el が低ければ、高さの 4 分の 1 まで狭める。リストの真ん中でスクロールしないように）
  function edgeScroller(target: () => HTMLElement | null) {
    let frame = 0;
    let last: { x: number; y: number; again: () => void } | null = null;
    let prev = 0;            // 前にスクロールした時刻（0 は止まっていた）
    let carry = [0, 0];      // 1px に満たない分（スクロールの位置は整数に丸められるため、次のコマへ持ち越す）
    // 端からの深さに応じた速さ（毎秒の px。向きは符号）
    const zoneOf = (size: number) => Math.max(8, Math.min(EDGE_SCROLL_ZONE, size / 4));
    const speed = (p: number, lo: number, hi: number, zone: number) => {
      const depth = p > hi - zone ? p - (hi - zone) : p < lo + zone ? -(lo + zone - p) : 0;
      const f = Math.min(1, Math.abs(depth) / zone);
      return Math.sign(depth) * f * f * EDGE_SCROLL_MAX;
    };
    const tick = (now: number) => {
      frame = 0;
      const el = target();
      if (!last || !el) return;
      // el の見えている範囲（画面の座標）。倍率がかかっていれば（リストの中）、見た目の大きさで
      const z = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
      const v = viewRectOf(el, z);
      const vx = speed(last.x, v.left, v.right, zoneOf(v.right - v.left)), vy = speed(last.y, v.top, v.bottom, zoneOf(v.bottom - v.top));
      if (!vx && !vy) { prev = 0; carry = [0, 0]; return; }
      // 前のコマからの時間（止まっていたら 1 コマ分。タブが裏に回っていたなどで間が空いても、一度に飛ばない）
      const dt = Math.min(prev ? now - prev : 16, 50) / 1000;
      prev = now;
      const mx = carry[0]! + vx * dt, my = carry[1]! + vy * dt;
      const dx = Math.trunc(mx), dy = Math.trunc(my);
      carry = [mx - dx, my - dy];
      if (!dx && !dy) { frame = requestAnimationFrame(tick); return; } // 1px に満たなければ、次のコマで足す
      const before = [el.scrollLeft, el.scrollTop];
      el.scrollLeft += dx;
      el.scrollTop += dy;
      if (el.scrollLeft === before[0] && el.scrollTop === before[1]) return; // もう進めない（上や左の端）
      last.again();
    };
    return {
      follow(ev: { clientX: number; clientY: number }, again: () => void) {
        last = { x: ev.clientX, y: ev.clientY, again };
        if (!frame) frame = requestAnimationFrame(tick);
      },
      stop() {
        last = null;
        prev = 0;
        carry = [0, 0];
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      },
    };
  }

  // 箱を足す所を探している間（追加モードの影、道具入れからのドラッグ）も、図の端へ寄せたらスクロールして図を広げる（2026-10-12 ユーザー）。
  // ポインタ（画面の座標）の先まで図を広げる（端の帯の幅の 2 倍。帯の中でもスクロールが続くように）。足す前に縮めないよう、
  // 広げた大きさは箱を足すかモードを変えるまで保つ（layout.ts の stretchWorld）。again はスクロールするたびに呼ぶ（影を置き直す）
  function followEdge(x: number, y: number, again: () => void = () => {}) {
    const { right, bottom } = viewRectOf(container);
    // 広げるのは右や下の端の帯の中だけ（上や左の端へはスクロールするだけ）
    if (x >= right - EDGE_SCROLL_ZONE || y >= bottom - EDGE_SCROLL_ZONE) {
      stretchWorld(...clientToIn(world.el, ctx.zoom(), x + EDGE_SCROLL_ZONE * 2, y + EDGE_SCROLL_ZONE * 2));
    }
    edgeScroll.follow({ clientX: x, clientY: y }, () => { followEdge(x, y, again); again(); });
  }

  // 付け替えはページ全体で受け取っているので、ここでは扱わない。遊びを越えるまでは move を呼ばない
  // 追加モードのポインタ。ボタンを押していないので、図の外の動きは図に届かない。そのため画面全体（window）で受け取り、
  // 図の外（タブの上など、端の帯と同じ幅まで）にいても端のスクロールを続ける（2026-10-12 ユーザー）。影は図の中にいるときだけ出す。
  // ブラウザの外へ出たら動きが届かなくなるので、最後の位置でスクロールを続け、戻ってきたら今の位置で決め直す
  function onAddMove(e: PointerEvent) {
    if (ctx.mode() !== "add") return;
    const { clientX: x, clientY: y } = e;
    const r = container.getBoundingClientRect();
    // 図が覆われている間（足すダイアログなどが開いている）は、影を出さず、スクロールもしない。
    // 覆われているかは、図の真ん中の一番上の要素が図の中のものかで見る（ダイアログは画面全体を覆う）
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && !container.contains(top)) { endAdd(); return; }
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (inside) showAdd(x, y); else hideAdd();
    // 図の外は、端の帯と同じ幅まで（タブの列の上など）。それより離れたら止める（ヘッダーのボタンやサイドバーへ動かしただけでスクロールしないように）
    const out = Math.max(r.left - x, x - r.right, r.top - y, y - r.bottom);
    if (out > EDGE_SCROLL_ZONE) { edgeScroll.stop(); return; }
    // スクロールの間は、足す所の強調を時々だけ探し直す（毎コマ探すと重く、スクロールがなめらかでなくなるため。押したときは必ず探す）
    let at = performance.now();
    followEdge(x, y, () => {
      const now = performance.now();
      if (inside && now - at > ADD_RECHECK) { at = now; showAdd(x, y); }
    });
  }

  function onPointerMove(e: PointerEvent) {
    if (ctx.mode() === "add") return; // 追加モードは onAddMove（画面全体で受け取る）
    const a = active;
    if (!a || a.g.kind === "lift") return;
    if (!a.started) {
      if (Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < a.g.slop) return;
      a.started = true;
    }
    a.g.move(e);
  }

  function onPointerUp(e: PointerEvent) {
    const a = active;
    if (!a || a.g.kind === "lift") return;
    active = null;
    a.g.end(e);
  }

  function onPointerOver(e: PointerEvent) {
    if (active?.g.kind === "move" || active?.g.kind === "lift" || active?.g.kind === "link") return;
    if (e.target instanceof Element && e.target.closest(".mz-port")) return; // 〇の上では、〇を出した箱のまま
    const n = boxOf(e.target);
    if (!active) showPorts(n && portable(n) ? n : null);
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
    if (active?.g.kind === "link") {
      active.g.cancel();
      active = null;
    }
    endLift();
    if (ctx.mode() === "add") ctx.leaveAdd();
  }

  // ---- 線を引く〇（docs/EDGE-TOOL-plan.md） ----
  // 選択モードで、選んでいない箱にポインタを乗せると、線がつながる範囲の四辺の真ん中に〇を出す（ひし形なら頂点と同じ位置）。
  // 〇は図の枠に置いた 4 つの要素で、画面の座標で固定する。〇からドラッグすると仮の線を伸ばし、引ける相手の上で離すと線を引く

  type Side = "t" | "r" | "b" | "l";
  const SIDES: Side[] = ["t", "r", "b", "l"];
  const PORT_OUT = 10; // 〇の中心を、辺からこれだけ外に置く
  const ports = SIDES.map(side => {
    const el = document.createElement("div");
    el.className = "mz-port";
    el.dataset.side = side;
    el.hidden = true;
    container.appendChild(el);
    return el;
  });
  // クラスの箱の属性・操作の行の左右に出す〇（docs/CLASS-plan.md）。要る数だけ作って使い回す
  const memberPorts: HTMLElement[] = [];
  const allPorts = () => [...ports, ...memberPorts];
  let portBox: Box | null = null;
  const isClass = (n: Box) => n.head.classList.contains("mz-shape-class");

  // 〇を出す箱: 選択モードで、選んでいない箱。リストの子とツリーの子には出さない（線を引かない）
  const portable = (n: Box) => ctx.mode() === "move" && ctx.current() !== n && abilitiesOf(n).link;

  // 箱 n の side の辺の接点（ワールドの座標）。out だけ辺の外へずらす。
  // 接点は線がつながる所と同じ: クラスの箱は決まった接点（classbox.ts の classAnchors。左右はクラス名の区画の真ん中）、ほかは辺の真ん中
  const OUTWARD: Record<Side, [number, number]> = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] };
  function sidePoint(n: Box, side: Side, out = 0): [number, number] {
    const r = L.absAnchorRect(n);
    const [x, y] = isClass(n) ? classAnchors(r)[side] : vertexAt(r, side);
    const [dx, dy] = OUTWARD[side];
    return [x + dx * out, y + dy * out];
  }

  // クラスの箱 n の、属性・操作 member の行の side（左か右）の端（ワールドの座標）。out だけ外へずらす
  function memberPoint(n: Box, member: string, side: Side, out = 0): [number, number] {
    const a = L.absAnchorRect(n);
    const y = a.y + (memberY(n.src, member) ?? a.h / 2);
    return side === "l" ? [a.x - out, y] : [a.x + a.w + out, y];
  }

  const toScreen = ([x, y]: [number, number]): [number, number] => inToClient(world.el, ctx.zoom(), x, y);

  // 箱 n の side の辺の〇の中心（画面の座標）
  function portPoint(n: Box, side: Side): [number, number] {
    return toScreen(sidePoint(n, side, unscale(PORT_OUT))); // 〇は画面の上で同じだけ離す
  }

  function showPorts(n: Box | null) {
    if (n === portBox) return;
    portBox = n;
    ports.forEach((el, i) => {
      el.hidden = !n;
      if (!n) return;
      const [x, y] = portPoint(n, SIDES[i]!);
      el.style.left = x + "px";
      el.style.top = y + "px";
    });
    // クラスの箱は、属性・操作の行ごとに左右の〇
    const names = n && isClass(n) ? memberNames(n.src) : [];
    while (memberPorts.length < names.length * 2) {
      const el = document.createElement("div");
      el.className = "mz-port mz-port-member";
      el.hidden = true;
      container.appendChild(el);
      memberPorts.push(el);
    }
    memberPorts.forEach((el, i) => {
      const name = names[i >> 1];
      el.hidden = name == null;
      if (name == null) return;
      const side: Side = i % 2 ? "r" : "l";
      el.dataset.side = side;
      el.dataset.member = name;
      const [x, y] = toScreen(memberPoint(n!, name, side, unscale(PORT_OUT)));
      el.style.left = x + "px";
      el.style.top = y + "px";
    });
  }
  function hidePorts() { showPorts(null); }

  // 線のドラッグ。from の side の〇から、ポインタまで仮の線を引く。ポインタの下の箱から外へたどり、最初に引ける箱を相手にする
  // （引ける相手の子の上でも、その相手に引く）。引ける相手以外は薄くする。引いた線の端は、〇の辺の真ん中と離した所に固定する
  // （相手の子の上で離したら終点は自由。自分に戻る線なら、離した所に近い角）
  function linkGesture(from: Box, side: Side, port: HTMLElement, member?: string): Gesture {
    const [sx, sy] = member != null ? toScreen(memberPoint(from, member, side, unscale(PORT_OUT))) : portPoint(from, side);
    const siblings = from.parent ? from.parent.children : world.children;
    const can = new Set(siblings.filter(o => ctx.canLink(from, o)));
    const overlay = document.createElementNS(SVGNS, "svg");
    overlay.setAttribute("class", "mz-link-preview");
    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("x1", String(sx)); line.setAttribute("y1", String(sy));
    line.setAttribute("x2", String(sx)); line.setAttribute("y2", String(sy));
    overlay.appendChild(line);
    container.appendChild(overlay);
    for (const el of allPorts()) el.hidden = el !== port;
    port.classList.add("mz-port-on");
    unfocus();
    dimExcept(can);
    let target: Box | null = null;
    let direct = false; // 相手そのものの上か（相手の子の上なら false）
    const mark = (t: Box | null) => {
      if (t === target) return;
      target?.el.classList.remove("mz-link-target");
      target = t;
      t?.el.classList.add("mz-link-target");
    };
    let toMember: string | undefined; // 相手がクラスの箱で、属性・操作の行の上なら、その名前
    const targetAt = (x: number, y: number): Box | null => {
      for (const el of document.elementsFromPoint(x, y)) {
        if (!container.contains(el) || !el.closest(".mz-node")) continue;
        const hit = boxOf(el);
        for (let b: Box | null = hit; b; b = b.parent) {
          if (!can.has(b)) continue;
          direct = b === hit;
          toMember = direct && b !== from ? el.closest<HTMLElement>(".mz-class-row")?.dataset.member : undefined;
          return b;
        }
        return null;
      }
      return null;
    };
    const finish = () => {
      mark(null);
      overlay.remove();
      port.classList.remove("mz-port-on");
      portBox = null;
      for (const el of allPorts()) el.hidden = true;
      unfocus();
    };
    return {
      kind: "link", slop: 3,
      move(ev) {
        line.setAttribute("x2", String(ev.clientX));
        line.setAttribute("y2", String(ev.clientY));
        mark(targetAt(ev.clientX, ev.clientY));
      },
      end(ev) {
        const t = target; // 遊びの内で離したとき（動かしていない）は、相手が無いので引かない
        finish();
        // 相手の子の上で離したら、終点は自由にする（子を横切る位置に固定しないように）
        const start = member != null ? memberPoint(from, member, side) : sidePoint(from, side);
        if (t) ctx.link(from, t, direct ? worldAt(ev) : undefined, start, t === from ? undefined : { from: member, to: toMember });
      },
      cancel: finish,
    };
  }

  // keep 以外の箱を薄くする（keep の子孫と祖先は薄くしない）
  function dimExcept(keep: Set<Box>) {
    const near = new Set<Box>();
    const down = (b: Box) => { near.add(b); b.children.forEach(down); };
    for (const k of keep) {
      down(k);
      for (let p = k.parent; p; p = p.parent) near.add(p);
    }
    const walk = (b: Box) => { b.el.classList.toggle("mz-dim", !near.has(b)); b.children.forEach(walk); };
    world.children.forEach(walk);
  }

  // ---- 箱の追加（追加モード。docs/ADD-plan.md） ----
  // ポインタに新しい箱の影（半透明の箱）を付け、押すと足す所を強調する。足す所の決まりは一覧から戻すドラッグと同じ
  // （箱の上ならその箱の子、何も無い所ならワールド。ページの箱の上には足せない）。リストの上（とリストの葉の子の上）では、
  // ポインタに近い子と子の間に線を出し、そこへ差し込む

  const ADD_RECHECK = 150; // 端のスクロールの間に、足す所を探し直す間隔（ミリ秒）
  let addGhost: HTMLElement | null = null;
  let addLine: HTMLElement | null = null;
  let addMarked: Box | null | undefined;

  // 押すと足す所（足せない所なら undefined）。差し込みの線を出す位置（画面の座標）も返す
  function addSpotAt(x: number, y: number): (AddRequest & { line?: { left: number; top: number; width: number } }) | undefined {
    const t = dropTargetAt(x, y, null);
    if (t === undefined) return undefined;
    // 並べ替えのできる戦略（リスト）の中なら、子と子の間に差し込む
    const reorders = (b: Box) => !!strategyOf(b)?.reorder;
    const list = t && reorders(t) ? t : t && t.parent && reorders(t.parent) && leafLike(t) ? t.parent : null;
    if (list) {
      const kids = list.children.map(k => ({ k, r: k.el.getBoundingClientRect() }));
      const next = kids.find(({ r }) => y < r.top + r.height / 2);
      const lr = list.el.getBoundingClientRect(), last = kids.at(-1)!.r;
      // 子と子の間の真ん中（描かれた隙間を測る。間隔のルールは読まない。子が 1 つなら隙間は無いので端に出す）
      const gap = kids.length > 1 ? (kids[1]!.r.top - kids[0]!.r.bottom) / 2 : 0;
      return {
        parentId: list.id, before: next?.k.id,
        line: { left: last.left, top: next ? next.r.top - gap : last.bottom + gap, width: Math.min(last.width, lr.width) },
      };
    }
    const [ax, ay] = clientToIn((t ?? world).el, ctx.zoom(), x - ADD_OFFSET.x, y - ADD_OFFSET.y);
    return { parentId: t ? t.id : null, at: { x: ax, y: ay } };
  }

  // shape は影に付ける形の絵（無ければ追加モードで足す形）
  function showAdd(x: number, y: number, shape: Shape = ctx.addShape()) {
    const spot = addSpotAt(x, y);
    if (!addGhost) {
      addGhost = document.createElement("div");
      addGhost.className = "mz-add-ghost";
      container.appendChild(addGhost);
    }
    addGhost.style.left = x - ADD_OFFSET.x + "px";
    addGhost.style.top = y - ADD_OFFSET.y + "px";
    // 足す形の絵を影に付ける（ボックスなら影だけ）
    if (addGhost.dataset.shape !== shape) {
      addGhost.dataset.shape = shape;
      addGhost.innerHTML = shape === DEFAULT_SHAPE ? "" : shapeIcon(shape, "mz-add-ghost-icon");
    }
    addGhost.classList.toggle("mz-ghost-no", !spot);
    if (spot?.line) {
      if (!addLine) {
        addLine = document.createElement("div");
        addLine.className = "mz-add-line";
        container.appendChild(addLine);
      }
      addLine.style.left = spot.line.left + "px";
      addLine.style.top = spot.line.top - 1 + "px";
      addLine.style.width = spot.line.width + "px";
    } else {
      addLine?.remove();
      addLine = null;
    }
    // 箱の中へ足すときは、その箱（何も無い所ならワールド）を強調する。リストへの差し込みは線だけで示す
    const mark = !spot || spot.line ? undefined : spot.parentId == null ? null : ctx.boxById(spot.parentId) ?? undefined;
    if (mark === addMarked) return;
    if (addMarked !== undefined) (addMarked ?? world).el.classList.remove("mz-drop");
    addMarked = mark;
    if (mark !== undefined) (mark ?? world).el.classList.add("mz-drop");
  }

  // 影と線と強調を消し、端のスクロールを止める（モードを変えたとき）。広げた図は、箱を足すかモードを変えるまで保つ
  function endAdd() {
    edgeScroll.stop();
    hideAdd();
  }
  // 影と線と強調だけを消す（図の外へ出たとき。端のスクロールは続ける）
  function hideAdd() {
    addGhost?.remove();
    addLine?.remove();
    addGhost = addLine = null;
    if (addMarked !== undefined) (addMarked ?? world).el.classList.remove("mz-drop");
    addMarked = undefined;
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
      if (!abilitiesOf(b).dropInto) return undefined; // ページの箱とクラスの箱（docs/CLASS-plan.md）、フローチャートの要素の中へは落とせない
      if (moving && !acceptsKid(b, moving.children.length > 0)) return undefined; // 子を持つ箱は、子が子を持てない戦略の中へ落とせない
      return moving && isInside(b, moving) ? undefined : b;
    }
    // 図（ワールド）へ落とす。ワールドの外（周りの余白。紙のページなら紙の外。D32・D33）には落とせない。
    // ワールドがフローチャートなら、子を持つ箱は落とせない
    const w = world.el.getBoundingClientRect();
    if (x < w.left || x > w.right || y < w.top || y > w.bottom) return undefined;
    return moving && !acceptsKid(world, moving.children.length > 0) ? undefined : null;
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
      const z = ctx.zoom();
      if (z !== 1) { g.style.transform = `scale(${z})`; g.style.transformOrigin = "0 0"; } // 図と同じ大きさに見せる（D32）
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
    if (active?.g.kind === "lift") active = null;
    ctx.liftEnd();
  }

  function dropLift(e: PointerEvent) {
    const l = lift!;
    // 落とす直前に、ポインタの下を見直す（タブの切り替えで描き直したあと、まだ動かしていないこともある）
    const t = l.ghost ? dropTargetAt(e.clientX, e.clientY, ctx.boxById(l.id) ?? null) : undefined;
    // 新しい親の中での位置（ゴーストの左上）
    let at: { x: number; y: number } | undefined;
    if (t !== undefined) {
      const [ax, ay] = clientToIn((t ?? world).el, ctx.zoom(), e.clientX - l.offX, e.clientY - l.offY);
      at = { x: ax, y: ay };
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
    const [ax, ay] = clientToIn((t ?? world).el, ctx.zoom(), e.clientX - ADD_OFFSET.x, e.clientY - ADD_OFFSET.y);
    const at = { x: ax, y: ay };
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
  window.addEventListener("pointermove", onAddMove, { signal });
  container.addEventListener("pointerup", onPointerUp, { signal });
  container.addEventListener("pointercancel", onPointerUp, { signal });
  container.addEventListener("pointerover", onPointerOver, { signal });
  container.addEventListener("pointerleave", () => {
    if (active?.g.kind !== "move" && active?.g.kind !== "link") unfocus();
    if (!active) hidePorts();
    unmarkRemove();
    hideAdd(); // 追加モードの端のスクロールは、図の外でも続ける（onAddMove）
  }, { signal });
  container.addEventListener("scroll", hidePorts, { signal, capture: true }); // 〇は画面の座標に置いているので、スクロールしたら消す
  container.addEventListener("dragover", onDragOver, { signal });
  container.addEventListener("dragleave", e => {
    if (!(e.relatedTarget instanceof Node && container.contains(e.relatedTarget))) markRestore(undefined);
  }, { signal });
  container.addEventListener("drop", onDrop, { signal });
  document.addEventListener("keydown", onKeyDown, { signal });

  return {
    dragging: () => active != null,
    endLift,
    endAdd,
    // 描き直すときに、ドラッグと削除の印を忘れる。付け替えのドラッグは続ける（落とし先は描き直した要素で探し直す）
    reset() {
      hidePorts(); // 描き直すと箱が動くことがある（次にポインタを乗せたとき出し直す）
      active?.g.cancel();
      if (active?.g.kind !== "lift") active = null;
      removing = null;
      // 描き直すと箱の要素が作り直されるので、強調は付け直す（次にポインタが動いたとき）
      if (addMarked !== undefined) (addMarked ?? world).el.classList.remove("mz-drop");
      addMarked = undefined;
    },
    unmarkRemove,
    // タブを図へドラッグしてリンクの箱を作るとき（D29）: 画面の座標 at に追加モードと同じ影を出し、落とせば足す所を返す（足せない所なら null）。
    // at が null なら影を消す
    ghost(at: { x: number; y: number } | null): AddRequest | null {
      if (!at) { hideAdd(); return null; }
      showAdd(at.x, at.y, DEFAULT_SHAPE);
      const spot = addSpotAt(at.x, at.y);
      return spot ? { parentId: spot.parentId, ...(spot.at ? { at: spot.at } : {}), ...(spot.before != null ? { before: spot.before } : {}) } : null;
    },
    destroy() { lift?.stop.abort(); listening.abort(); },
  };
}
