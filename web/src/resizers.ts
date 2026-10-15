// つまみで大きさを変える: 本文の幅（docs/BODY-plan.md）、リストの幅（docs/SIZE-plan.md の 10 章）、スクロールにしたリストの高さ（D33）。
// どれも、ドラッグの間は開始時の位置の写しから毎回決め直し（押しのけた相手は、戻せば戻る）、手を離したら 1 件の履歴にする。
// ドラッグの状態（いつ始めて終えるか）は interaction.ts
import { BODY_MIN_W } from "./layout/node-kinds";
import { type Box, bodyWrapW, isNesting, setOrDelete, setSpec, sizeOf } from "./model";
import { GROUP_MIN, SIZES } from "./validate";

export interface ResizersContext {
  nodes(): Box[];
  settle(n: Box): void;     // n の大きさが変わった（押しのけて描き直す。layout の resizeBody の場面）
  centerX(n: Box): number;  // 最上位の箱の、本来いたい横の真ん中
  changed(): void;          // 1 件の履歴に残す
  notifySelect(): void;
}

export function createResizers(ctx: ResizersContext) {
  // 本文の幅をつまんで変える（docs/BODY-plan.md の段階 2）。開始時の位置を覚えておき、幅を変えるたびにそこから決め直す
  // （押しのけた相手は、狭めれば戻る）。手を離したら 1 件の履歴にする。
  // 変えられる幅は、葉の見た目の箱なら本文の最小の幅〜サイズの最大。内包する箱・リストの親なら本文の最小の幅〜子の並びで決まった箱の幅
  // （本文で箱は広がらない。箱の幅まで広げたら自動に戻す。docs/SIZE-plan.md）
  function bodyResizer(n: Box) {
    const snap = new Map(ctx.nodes().map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = typeof n.src.bodyWidth === "number" ? n.src.bodyWidth : undefined;
    const group = isNesting(n);
    const width = group ? bodyWrapW(n, n.hw) : n.hw;
    const max = group ? n.hw : SIZES[sizeOf(n)].maxW;
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (w: number | undefined) => {
      restore();
      setOrDelete(n.src, "bodyWidth", w, w == null);
      ctx.settle(n);
    };
    return {
      width,
      set(w: number) {
        const v = Math.round(Math.max(BODY_MIN_W, Math.min(max, w)));
        apply(group && v >= Math.floor(max) ? undefined : v);
      },
      finish() {
        if (!n.parent) n.intendedCX = ctx.centerX(n);
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // リストの幅のつまみ（docs/SIZE-plan.md の 10 章）。ドラッグの間は開始時の位置の写しから毎回決め直し（本文の幅と同じ場面）、
  // 手を離したら 1 件の履歴。幅は width に書く（狭める下限は layout が決める。node-kinds.ts の list）
  function listResizer(n: Box) {
    const snap = new Map(ctx.nodes().map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = n.specW;
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (w: number) => {
      restore();
      setSpec(n, "w", w);
      ctx.settle(n);
    };
    return {
      width: n.w,
      set(w: number) { apply(Math.round(Math.max(GROUP_MIN.w, w))); },
      finish() {
        if (!n.parent) n.intendedCX = ctx.centerX(n);
        ctx.changed();
        ctx.notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // スクロールにしたリストの高さの上限（D33）。つまみを動かした分だけ変え、周りは押しのける（手を離したら確定）
  function listHeightResizer(n: Box) {
    const snap = new Map(ctx.nodes().map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = Number(n.src.listHeight) || n.h;
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (h: number) => {
      restore();
      n.src.listHeight = h;
      ctx.settle(n);
    };
    return {
      width: n.h, // 今の高さ（resizeGesture は width という名前で受け取る）
      set(h: number) { apply(Math.round(Math.max(n.kidsTop + 32, Math.min(n.fullH, h)))); },
      finish() { ctx.changed(); ctx.notifySelect(); },
      cancel() { apply(before); },
    };
  }

  return { body: bodyResizer, list: listResizer, listHeight: listHeightResizer };
}
