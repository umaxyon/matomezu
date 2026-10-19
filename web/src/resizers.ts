// つまみで大きさを変える: 本文の幅（docs/BODY-plan.md）、リストの幅（docs/SIZE-plan.md の 10 章）、スクロールにしたリストの高さ（D33）、
// 枠のつまみ（箱の大きさを自由に決めて固定にする。D45。docs/BOX-SIZE-plan.md の 6.3）。
// どれも、ドラッグの間は開始時の位置の写しから毎回決め直し（押しのけた相手は、戻せば戻る）、手を離したら 1 件の履歴にする。
// 押しのけ方は大きさが変わったときの統一した決まり（layout.ts の regrow。docs/PAPER-plan.md の 4.6）。紙に収まらない大きさにはせず、収まった最後の大きさで止める
// ドラッグの状態（いつ始めて終えるか）は interaction.ts
import type { Layout } from "./layout/layout";
import { BODY_MIN_W, LEAF_PAD_X } from "./layout/node-kinds";
import { type Box, bodyWidthOf, isNesting, listHeightOf, setOrDelete, setSpec, sizeRuleOf } from "./model";

type Prior = ReturnType<Layout["snapshot"]>;

export interface ResizersContext {
  snapshot(): Prior;                     // つまみを握ったときの様子（regrow に渡す）
  hold(): () => void;                    // つまみを握ったときの位置を覚え、戻す関数を返す（動かすたびに、そこから決め直す）
  restyle(n: Box): void;                 // データの見せ方を描き直す（大きさを測る前。本文の幅は CSS の変数で効く。render.ts の applyStyle）
  regrow(n: Box, prior: Prior): boolean; // n の大きさが変わった（押しのけて描き直す）。紙に収まらなければ false（位置は書き換えない）
  changed(): void;          // 1 件の履歴に残す
  notifySelect(): void;
}

export function createResizers(ctx: ResizersContext) {
  // 本文の幅をつまんで変える（docs/BODY-plan.md の段階 2）。開始時の位置を覚えておき、幅を変えるたびにそこから決め直す
  // （押しのけた相手は、狭めれば戻る）。手を離したら 1 件の履歴にする。
  // 本文を箱の中で狭めるだけで、箱の幅は変えない（D45。2026-10-19 ユーザー）。変えられる幅は本文の最小の幅〜箱の内側の幅で、
  // 箱の内側の幅まで広げたら自動に戻す。子の無い箱の幅は本文の列の幅、内包する箱・リストの親は箱の幅として数える（左右の余白を含む）
  function bodyResizer(n: Box) {
    const restore = ctx.hold();
    const before = typeof n.src.bodyWidth === "number" ? n.src.bodyWidth : undefined;
    const group = isNesting(n);
    const max = group ? n.hw : n.hw - 2 * LEAF_PAD_X;
    const width = Math.min(bodyWidthOf(n) || max, max);
    const prior = ctx.snapshot();
    let last = before;
    const apply = (w: number | undefined) => {
      restore();
      setOrDelete(n.src, "bodyWidth", w, w == null);
      ctx.restyle(n);
      return ctx.regrow(n, prior);
    };
    return {
      width,
      set(w: number) {
        const v = Math.round(Math.max(BODY_MIN_W, Math.min(max, w)));
        const next = v >= Math.floor(max) ? undefined : v;
        if (apply(next)) last = next; else apply(last);
      },
      finish() {
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // リストの幅のつまみ（docs/SIZE-plan.md の 10 章）。ドラッグの間は開始時の位置の写しから毎回決め直し（本文の幅と同じ場面）、
  // 手を離したら 1 件の履歴。幅は width に書く（狭める下限は layout が決める。node-kinds.ts の list）
  function listResizer(n: Box) {
    const restore = ctx.hold();
    const before = n.specW;
    const prior = ctx.snapshot();
    let last = before;
    const apply = (w: number) => {
      restore();
      setSpec(n, "w", w);
      return ctx.regrow(n, prior);
    };
    return {
      width: n.w,
      set(w: number) { const v = Math.round(Math.max(sizeRuleOf(n).min.w, w)); if (apply(v)) last = v; else apply(last); },
      finish() {
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // スクロールにしたリストの高さの上限（D33）。つまみを動かした分だけ変え、周りは押しのける（手を離したら確定）
  function listHeightResizer(n: Box) {
    const restore = ctx.hold();
    const before = listHeightOf(n) || n.h;
    const prior = ctx.snapshot();
    let last = before;
    const apply = (h: number) => {
      restore();
      n.src.listHeight = h;
      return ctx.regrow(n, prior);
    };
    return {
      width: n.h, // 今の高さ（resizeGesture は width という名前で受け取る）
      set(h: number) { const v = Math.round(Math.max(n.kidsTop + 32, Math.min(n.fullH, h))); if (apply(v)) last = v; else apply(last); },
      finish() { ctx.changed(); ctx.notifySelect(); },
      cancel() { apply(before); },
    };
  }

  // 枠のつまみ（D45）。動かした向きだけ固定にする（axis。x は幅、y は高さ、xy は両方）。下限は決まりの最小（土台の最小 64×44 など）で、
  // それより小さくしても、測る所が中身による最小（タイトルと本文の 1 行ずつ）と子の並び（内包する箱）までしか縮めない。
  // 手を離したら、収まった今の大きさを固定の値として書く（データの width・height は今の大きさ。CLAUDE.md の 17）
  function frameResizer(n: Box, axis: "x" | "y" | "xy") {
    const restore = ctx.hold();
    const before = { w: n.specW, h: n.specH };
    const prior = ctx.snapshot();
    const min = sizeRuleOf(n).min;
    const size = { w: n.w, h: n.h };
    let last = size;
    const apply = (w: number, h: number) => {
      restore();
      if (axis !== "y") setSpec(n, "w", w);
      if (axis !== "x") setSpec(n, "h", h);
      ctx.restyle(n);
      return ctx.regrow(n, prior);
    };
    return {
      size,
      set(w: number, h: number) {
        const v = { w: Math.round(Math.max(min.w, w)), h: Math.round(Math.max(min.h, h)) };
        if (apply(v.w, v.h)) last = v; else apply(last.w, last.h);
      },
      finish() {
        if (axis !== "y") setSpec(n, "w", Math.round(n.w));
        if (axis !== "x") setSpec(n, "h", Math.round(n.h));
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() {
        restore();
        setSpec(n, "w", before.w);
        setSpec(n, "h", before.h);
        ctx.restyle(n);
        ctx.regrow(n, prior);
      },
    };
  }

  return { body: bodyResizer, list: listResizer, listHeight: listHeightResizer, frame: frameResizer };
}
