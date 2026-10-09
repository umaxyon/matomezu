// 線のドラッグの中身: 折れ線の途中の区間、線の端、線のキャプションの札（docs/REFACTOR-2.md）。
// どれも線のデータ（e.src）を書き換えて、edited で描き直してもらう。ドラッグの状態（いつ始めて終えるか）は interaction.ts

import { SVGNS } from "./dom";
import { type Box, type Edge, absPos } from "./model";
import { type Pt, leftNormalAt, nearestAt, pointAt } from "./geom";
import { CAPTION_OFFSET_MAX } from "./render";
import { simplifyVia } from "./routing";
import { perimeter } from "./selfloop";

export interface EdgeDragContext {
  svg: SVGSVGElement;      // 吸着の目印を描く所
  edges(): Edge[];
  anchorRect(n: Box): { x: number; y: number; w: number; h: number }; // 線がつながる範囲（箱の左上から）
  redraw(): void;          // 線を描き直す
  edited(e: Edge): void;   // e.src を書き換えた（描き直し、選んでいる線ならサイドバーに知らせる）
  committed(e: Edge): void; // ドラッグを終えた（1 件の履歴に残し、選んでいる線ならサイドバーに知らせる）
}

export type EdgeDrag = ReturnType<typeof createEdgeDrag>;

// 吸着する距離（px）
const SNAP_DISTANCE = 8;

export function createEdgeDrag(ctx: EdgeDragContext) {
  let snapMark: SVGCircleElement | null = null;

  // 線がつながる範囲（ワールドの座標）
  function edgeRect(n: Box) {
    const [x, y] = absPos(n);
    const r = ctx.anchorRect(n);
    return { x: x + r.x, y: y + r.y, w: r.w, h: r.h };
  }

  // 端をドラッグしている線 e の、箱 own の側の端（動ける道 path、今の点 p）が吸着するほかの線の端。
  // 対象は、同じ箱につながるほかの線の端のうち、この端が動ける道の上にあるもの（同じ辺）。一番近いものを SNAP_DISTANCE まで
  function snapTarget(e: Edge, own: Box, path: Pt[], p: Pt): Pt | null {
    let best: Pt | null = null, bestD = SNAP_DISTANCE;
    for (const o of ctx.edges()) {
      if (o === e || o.el.style.display === "none" || o.points.length < 2) continue;
      const ends: Pt[] = [];
      if (o.a === own) ends.push(o.points[0]!);
      if (o.b === own) ends.push(o.points[o.points.length - 1]!);
      for (const q of ends) {
        const on = pointAt(path, nearestAt(path, q[0], q[1]));
        if (Math.hypot(on[0] - q[0], on[1] - q[1]) > 0.5) continue; // この端が動ける辺の上に無い
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d <= bestD) { best = q; bestD = d; }
      }
    }
    return best;
  }

  // 吸着した相手の端に目印（輪）を出す。null で消す
  function showSnap(at: Pt | null) {
    if (!at) { snapMark?.remove(); snapMark = null; return; }
    if (!snapMark) {
      snapMark = document.createElementNS(SVGNS, "circle");
      snapMark.setAttribute("class", "mz-snap");
      snapMark.setAttribute("r", "9");
    }
    snapMark.setAttribute("cx", String(at[0]));
    snapMark.setAttribute("cy", String(at[1]));
    ctx.svg.appendChild(snapMark);
  }

  return {
    // 途中の区間をドラッグしている間、位置を変えて描き直す（手を離したら endVia で 1 件の履歴にする）。
    // 自動の形なら、まずそのときの形を書き込む（以後はその形を保つ）
    setVia(e: Edge, index: number, at: number) {
      if (!e.shape) return;
      const seg = e.segments.find(s => s.index === index);
      if (!seg) return;
      if (!e.src.via) {
        e.src.exit = e.shape.exit;
        e.src.enter = e.shape.enter;
      }
      const via = [...(e.src.via as number[] | undefined ?? e.shape.via)];
      via[index] = Math.round(Math.min(seg.hi, Math.max(seg.lo, at)));
      e.src.via = via;
      ctx.edited(e);
    },

    // ドラッグを終えたら、長さ 0 になった区間の折れ目をまとめて、1 件の履歴にする
    endVia(e: Edge) {
      if (e.shape && Array.isArray(e.src.via)) {
        const at = { exitAt: typeof e.src.exitAt === "number" ? e.src.exitAt : null, enterAt: typeof e.src.enterAt === "number" ? e.src.enterAt : null };
        e.src.via = simplifyVia(edgeRect(e.a), edgeRect(e.b), { ...e.shape, via: e.src.via as number[] }, at);
        ctx.redraw();
      }
      ctx.committed(e);
    },

    // 線の端を、ポインタ（ワールドの座標）に一番近い、端が動ける辺の上の位置へ動かして描き直す
    setAt(e: Edge, end: "exit" | "enter", x: number, y: number) {
      if (!e.ends) return;
      const path = end === "exit" ? e.ends.exit : e.ends.enter;
      let t = nearestAt(path, x, y);
      if (e.a === e.b) {
        // 自分に戻る線: 動ける範囲（もう一方の端の辺とその両隣）の上の点を、箱のふちを一周した割合にして持つ（selfloop.ts）
        const target = snapTarget(e, e.a, path, pointAt(path, t));
        const [px, py] = target ?? pointAt(path, t);
        showSnap(target);
        e.src[end === "exit" ? "exitAt" : "enterAt"] = Math.round(nearestAt(perimeter(edgeRect(e.a)), px, py) * 1000) / 1000;
        ctx.edited(e);
        return;
      }
      // 同じ箱の、この端が動ける辺の上にあるほかの線の端に SNAP_DISTANCE まで近づいたら、その点に合わせる（値をそろえるだけ。
      // つながりは覚えない。docs/LAYOUT-plan.md の 2.3）
      const target = snapTarget(e, end === "exit" ? e.a : e.b, path, pointAt(path, t));
      if (target) t = nearestAt(path, target[0], target[1]);
      showSnap(target);
      e.src[end === "exit" ? "exitAt" : "enterAt"] = Math.round(t * 1000) / 1000;
      ctx.edited(e);
    },

    // 線の端のドラッグを終えた（吸着の目印を消す）
    endAt() { showSnap(null); },

    // キャプションの札をドラッグしている間、ポインタ（ワールドの座標）に近い線の上の位置と、線から離す量に置き直す
    // （手を離したら 1 件の履歴にする）。離す量は ±CAPTION_OFFSET_MAX まで
    setCaptionAt(e: Edge, x: number, y: number) {
      if (e.points.length < 2) return;
      const at = nearestAt(e.points, x, y);
      const [bx, by] = pointAt(e.points, at);
      const [nx, ny] = leftNormalAt(e.points, at);
      const off = Math.max(-CAPTION_OFFSET_MAX, Math.min(CAPTION_OFFSET_MAX, (x - bx) * nx + (y - by) * ny));
      e.src.captionAt = Math.round(at * 1000) / 1000;
      e.src.captionOffset = Math.round(off);
      ctx.edited(e);
    },
  };
}
