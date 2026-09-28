// ドラッグ中の配置。settle（場面の表）は使わず、ポインタが動くたびに tryMove で動かす。決まり:
//   - 動かしているボックスは、兄弟にぶつかれば止まる（ぶつかった相手の外側へ少し押し出すか、軸ごとにスライドする）
//   - 中身を動かして広がった祖先は、前に下にいた相手を下へ、右にいた相手を右へ押す（押した先でも連鎖する）。
//     左や上にいた相手とぶつかる、押した先が親に収まらない、などのときはその動きを取り消す
//   - 押し方は settle の slide（opt.gap ずつずらす）と違い、相手の端まで一度に押す（そろえるかは要相談）
import type { Layout, LayoutOptions } from "./layout";
import { type Box, ancestors } from "../model";

export type Drag = ReturnType<typeof createDrag>;

export function createDrag(opt: LayoutOptions, L: Layout) {
  const { siblings, clamp, overlaps, collides, isPlaced, fit, refitAncestors } = L;

  // 親の中に収まる位置にあるか
  const clamped = (m: Box) => {
    const [cx, cy] = clamp(m, m.x, m.y);
    return Math.abs(cx - m.x) <= 0.5 && Math.abs(cy - m.y) <= 0.5;
  };

  // n と、n の移動で広がった祖先がすべて正しく置けているか
  function validChain(n: Box) {
    for (let m: Box | null = n; m; m = m.parent) {
      if (collides(m, m.x, m.y) || !clamped(m)) return false;
    }
    return true;
  }

  // 広がった祖先 m が兄弟にぶつかったら、相手を押しのける。before は広がる前の m の位置と大きさ。
  // 前に m の下にあった相手は下へ、右にあった相手は右へ押す。押した先でぶつかる相手も同じ向きに押す。
  // 左や上にあった相手とぶつかる、押した先が親に収まらない、などのときは false（呼び出し側で元に戻す）。
  // 動かした相手の元の位置は moved に残す
  function pushAway(m: Box, before: { x: number; y: number; w: number; h: number },
                    moved: Map<Box, [number, number]>): boolean {
    const g = opt.gap;
    // o を、by に重ならないよう dir の向きへ押す
    const push = (o: Box, dir: "down" | "right", by: Box, depth: number): boolean => {
      if (depth > 50) return false;
      const origX = o.x, origY = o.y;
      if (!moved.has(o)) moved.set(o, [o.x, o.y]);
      if (dir === "down") o.y = by.y + by.h + g;
      else o.x = by.x + by.w + g;
      if (!clamped(o)) return false;
      for (const p of siblings(m)) {
        if (p === o || p === m || !isPlaced(p) || !overlaps(o, o.x, o.y, p)) continue;
        // 押した相手の先（下か右）にあるものだけ、続けて押す
        const ahead = dir === "down" ? p.y >= origY - 0.5 : p.x >= origX - 0.5;
        if (!ahead || !push(p, dir, o, depth + 1)) return false;
      }
      return true;
    };
    for (const o of siblings(m)) {
      if (o === m || !isPlaced(o) || !overlaps(m, m.x, m.y, o)) continue;
      if (o.y >= before.y + before.h - 0.5) {
        if (!push(o, "down", m, 0)) return false;
      } else if (o.x >= before.x + before.w - 0.5) {
        if (!push(o, "right", m, 0)) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  // n を動かしたあと、n が正しく置けているか確かめ、広がった祖先の周りを押しのける
  function settleChain(n: Box, before: Map<Box, { x: number; y: number; w: number; h: number }>,
                       moved: Map<Box, [number, number]>): boolean {
    if (collides(n, n.x, n.y) || !clamped(n)) return false;
    for (const m of ancestors(n)) {
      fit(m); // 下の階層で押しのけた分を反映する
      if (!clamped(m)) return false;
      if (collides(m, m.x, m.y) && !pushAway(m, before.get(m)!, moved)) return false;
    }
    return true;
  }

  // 目標位置に向けて動かす。重なる場合は、ぶつかった相手の外側へ押し出し、
  // それでも無理なら軸ごとにスライドさせ、最後は動かさない。
  // n の移動で広がった親が隣にぶつかったら、隣を押しのける（pushAway）
  function tryMove(n: Box, tx: number, ty: number) {
    const ox = n.x, oy = n.y;
    // すでに重なっているなら、引き離せるよう重なりの判定をしない（重なったままだと、どこへも動けなくなる）
    const stuck = !validChain(n);
    const attempt = ([x, y]: [number, number]) => {
      const before = new Map(ancestors(n).map(m => [m, { x: m.x, y: m.y, w: m.w, h: m.h }]));
      const moved = new Map<Box, [number, number]>();
      n.x = x; n.y = y;
      refitAncestors(n);
      if (stuck || settleChain(n, before, moved)) {
        // ドラッグで広がった祖先に押された箱は、押された先を本来いたい位置にする
        // （離れても戻さない。2026-09-28 にユーザーと決めた。docs/LAYOUT-PENDING.md の 6）
        for (const b of moved.keys()) b.intendedY = b.y;
        return true;
      }
      for (const [b, [bx, by]] of moved) { b.x = bx; b.y = by; }
      n.x = ox; n.y = oy;
      refitAncestors(n);
      return false;
    };

    [tx, ty] = clamp(n, tx, ty);
    if (attempt([tx, ty])) return true;

    let x = tx, y = ty;
    for (let i = 0; i < 6; i++) {
      const hit = siblings(n).find(o => o !== n && overlaps(n, x, y, o));
      if (!hit) break;
      const g = opt.gap;
      const pushL = (x + n.w + g) - hit.x;
      const pushR = (hit.x + hit.w + g) - x;
      const pushU = (y + n.h + g) - hit.y;
      const pushD = (hit.y + hit.h + g) - y;
      const m = Math.min(pushL, pushR, pushU, pushD);
      if (m === pushL) x -= pushL;
      else if (m === pushR) x += pushR;
      else if (m === pushU) y -= pushU;
      else y += pushD;
      [x, y] = clamp(n, x, y);
    }
    if (Math.hypot(x - ox, y - oy) < 80 && attempt([x, y])) return true;

    if (attempt(clamp(n, tx, oy))) return true;
    if (attempt(clamp(n, ox, ty))) return true;
    return false;
  }

  return { tryMove };
}
