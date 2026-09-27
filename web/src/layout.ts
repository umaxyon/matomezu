// 配置: 大きさの計算、ツリーの並べ方、重なりの判定と直し方、読み込み時の配置。
// 状態（ボックスや線の一覧）は ctx から読む。
//
// 重なりの直し方は場面ごとに決まりが違う（どれも利用者と相談して決めたもの）:
//   読み込み・設定変更のあと  placeGroup + spotBelow   変更したボックス（と祖先）を残し、ほかは同じ x のまま下へ。
//                                                       位置の無いボックスは空きを探す（findFreeSpot / findGridSpot）
//   ドラッグ中                tryMove + pushAway       動かしたボックスは兄弟にぶつかれば止まる。広がった祖先は、
//                                                       前に下にいた相手を下へ、右にいた相手を右へ押す（連鎖）
//   設定変更で広がったとき    anchorPlan + stepAside   線の相手の側の辺（か中心）を保ち、自分より大きい相手とは
//                                                       自分がずれる
//   子のサイズをそろえる      compress                 中身を寄せ、重なれば下（高さのときは右）へ
//   読み込み直後              fitToViewport            右半分からはみ出した最上位を、線の相手の真下へ

import {
  type Box, type Container, type Edge, type World,
  ancestors, inNest, isNesting, other, overflowOf, shapeOf, sizeOf, treeDirOf, viewOf,
} from "./model";
import { SIZES } from "./validate";

const PERSON_MIN_W = 64; // スティックマンの最小の幅

// 文字の大きさを測った結果（measure）。フォントの読み込みが終わると文字の幅が変わるので捨てる
const measureCache = new Map<string, [number, number]>();
if (typeof document !== "undefined") document.fonts?.addEventListener?.("loadingdone", () => measureCache.clear());

export interface LayoutOptions {
  gap: number;
  padding: number;
  header: number;
  treeGapX: number;
  treeGapY: number;
}

export interface LayoutContext {
  opt: LayoutOptions;
  world: World;
  worldEl: HTMLElement;
  container: HTMLElement;
  roots(): Box[];
  edges(): Edge[];
}

export type Layout = ReturnType<typeof createLayout>;

export function createLayout(ctx: LayoutContext) {
  const { opt, world, worldEl, container } = ctx;
  const roots = () => ctx.roots();
  const edges = () => ctx.edges();

  const containerOf = (n: Box): Container => n.parent ?? world;
  const siblings = (n: Box) => containerOf(n).children;
  // n につながる線
  const incident = (n: Box) => edges().filter(e => e.a === n || e.b === n);

  // 子を置ける領域の内側の余白
  function innerArea(c: Container) {
    return {
      left: opt.padding,
      top: c.isWorld ? opt.padding : opt.header,
      right: opt.padding,
      bottom: opt.padding,
    };
  }

  // 大きさが固定されている方向（grow 以外は幅、clip は高さも）。
  // ワールドは幅を固定し、高さは指定が無ければ下へ伸ばせる（横スクロールより縦スクロールの方が見やすい）
  function fixedSize(c: Container): { w: number | null; h: number | null } {
    if (c.isWorld) return { w: world.w, h: world.src.height ? world.h : null };
    const ov = overflowOf(c);
    return {
      w: ov === "grow" ? null : (c.specW || SIZES.L.w),
      h: ov === "clip" ? (c.specH || SIZES.L.h) : null,
    };
  }

  // 指定が無ければ、表示領域と置かれているボックスの範囲の大きい方にする。
  // 表示領域が狭くなってもボックスは動かさず、はみ出た分はスクロールで見る
  function syncWorld() {
    const s = world.src;
    let right = 0, bottom = 0;
    for (const n of roots()) {
      if (!n.hasPos || !n.w) continue;
      right = Math.max(right, n.x + n.w + opt.padding);
      bottom = Math.max(bottom, n.y + n.h + opt.padding);
    }
    world.w = Number(s.width) || Math.max(container.clientWidth, right);
    world.h = Number(s.height) || Math.max(container.clientHeight, bottom);
    worldEl.style.width = world.w + "px";
    worldEl.style.height = world.h + "px";
    worldEl.classList.toggle("mz-ov-clip", overflowOf(world) === "clip");
  }

  // ---- 大きさ ----

  // 文字の大きさを測る（width が null なら1行のまま）。
  // 測るたびにブラウザが配置を計算し直すので、表示に関わるもの（クラス、文字、幅、行の高さ）が同じなら結果を使い回す
  function measure(n: Box, width: number | null): [number, number] {
    const t = n.textEl;
    const key = `${n.head.className}|${t.className}|${t.style.lineHeight}|${width}|${t.textContent}`;
    const hit = measureCache.get(key);
    if (hit) return hit;
    const s = n.head.style;
    const prev = [s.width, s.height] as const;
    s.width = width == null ? "max-content" : width + "px";
    s.height = "auto";
    const r: [number, number] = [n.head.offsetWidth, n.head.offsetHeight];
    [s.width, s.height] = prev;
    if (measureCache.size > 2000) measureCache.clear();
    measureCache.set(key, r);
    return r;
  }

  // ボックスとして見せるときの本体の大きさ。useSpec が false なら width, height, overflow を使わない
  function fitHead(n: Box, useSpec: boolean) {
    const z = SIZES[sizeOf(n)];
    if (shapeOf(n) === "person") {
      // 人の形と足元の文字。幅は文字に合わせ、長ければ折り返す（背景が無いので、固定の大きさは使わない）
      const maxText = Math.min(z.maxW || Infinity, (useSpec && n.specW) || SIZES.L.w);
      const w = Math.max(PERSON_MIN_W, Math.min(maxText, measure(n, null)[0]));
      n.hw = w;
      n.hh = measure(n, w)[1];
      return;
    }
    if (z.fixed) {
      n.hw = z.w;
      n.hh = z.h;
      return;
    }
    const maxW = z.maxW || Infinity;
    const maxH = z.maxH || Infinity;
    const ov = useSpec ? overflowOf(n) : "wrap";
    const minW = Math.min(maxW, (useSpec && n.specW) || z.w);
    const minH = Math.min(maxH, (useSpec && n.specH) || z.h);
    let w = minW, h = minH;
    if (ov === "wrap") {
      h = Math.max(minH, measure(n, minW)[1]);
    } else if (ov === "grow") {
      const [tw, th] = measure(n, null);
      w = Math.max(minW, tw);
      h = Math.max(minH, th);
    }
    n.hw = Math.min(maxW, w);
    n.hh = Math.min(maxH, h);
  }

  // 子を組織図のように並べる。上下なら横一列、左右なら縦一列にして、親をその中央にそろえる。
  // 全体を薄い枠で囲むので、周りに余白を取る（同じ階層との線は、この枠のふちにつなぐ）。
  // 向きごとに書き分けず、子を置く向きを「主軸」、それに直交する向きを「副軸」として扱う
  function layoutTree(n: Box) {
    const kids = n.children;
    const dir = treeDirOf(n);
    const vertical = dir === "down" || dir === "up";
    const forward = dir === "down" || dir === "right"; // 子が親より後ろ（下か右）に来るか
    const P = opt.padding;
    const GAP = opt.treeGapX; // 子どうしの間隔（副軸）
    const DIST = opt.treeGapY; // 親と子の間隔（主軸）
    // [主軸, 副軸] の大きさ
    const headSize = vertical ? [n.hh, n.hw] : [n.hw, n.hh];
    const kidSize = (k: Box) => (vertical ? [k.h, k.w] : [k.w, k.h]);
    const crossTotal = kids.reduce((s, k) => s + kidSize(k)[1]!, 0) + GAP * (kids.length - 1);
    const cross = Math.max(headSize[1]!, crossTotal);
    const kidsMain = Math.max(...kids.map(k => kidSize(k)[0]!));

    // 主軸: 親、間隔、子の順（前向き）か、子、間隔、親の順（後ろ向き）。子は親に向いた側の端をそろえる
    const headMain = forward ? P : P + kidsMain + DIST;
    const headCross = P + (cross - headSize[1]!) / 2;
    let c = P + (cross - crossTotal) / 2;
    const place = (k: Box, main: number, crossPos: number) => {
      if (vertical) { k.x = crossPos; k.y = main; } else { k.x = main; k.y = crossPos; }
    };
    for (const k of kids) {
      const [km, kc] = kidSize(k);
      place(k, forward ? P + headSize[0]! + DIST : P + kidsMain - km!, c);
      k.placed = true;
      c += kc! + GAP;
    }
    if (vertical) { n.hx = headCross; n.hy = headMain; } else { n.hx = headMain; n.hy = headCross; }
    const main = P + headSize[0]! + DIST + kidsMain + P;
    const crossAll = P + cross + P;
    if (vertical) { n.w = crossAll; n.h = main; } else { n.w = main; n.h = crossAll; }
  }

  // 同じ階層との線をつなぐ範囲（ボックスの左上からの位置）。ツリーで見せていれば枠全体、それ以外は本体
  function anchorRect(n: Box) {
    if (n.children.length && viewOf(n) === "tree") return { x: 0, y: 0, w: n.w, h: n.h };
    return { x: n.hx, y: n.hy, w: n.hw, h: n.hh };
  }

  function fit(n: Box) {
    const view = viewOf(n);
    if (!n.children.length || view === "hidden") {
      fitHead(n, !n.children.length);
      n.hx = 0; n.hy = 0;
      n.w = n.hw; n.h = n.hh;
      return;
    }
    if (view === "tree") {
      fitHead(n, false);
      layoutTree(n);
      return;
    }
    // 内包: 子に合わせる（指定サイズは最小値として扱う）
    const ov = overflowOf(n);
    const minW = n.specW || SIZES.L.w;
    const minH = n.specH || SIZES.L.h;
    let r = 0, b = 0;
    for (const c of n.children) {
      r = Math.max(r, c.x + c.w);
      b = Math.max(b, c.y + c.h);
    }
    n.w = ov === "grow" ? Math.max(minW, r + opt.padding) : minW;
    n.h = ov === "clip" ? minH : Math.max(minH, b + opt.padding);
    n.hx = 0; n.hy = 0;
    n.hw = n.w; n.hh = n.h;
  }

  function refitAncestors(n: Box) {
    for (const p of ancestors(n)) fit(p);
  }

  // ---- 重なり判定 ----

  // 親の中に収まる位置に寄せる（大きさが固定されていない方向は、親が伸びるので上限なし）
  function clamp(n: Box, x: number, y: number): [number, number] {
    if (!inNest(n)) return [x, y]; // ツリーの子は自動で並ぶ
    const c = containerOf(n);
    const a = innerArea(c);
    const pad = c.isWorld ? 0 : opt.padding;
    const minX = c.isWorld ? 0 : a.left;
    const minY = c.isWorld ? 0 : a.top;
    const f = fixedSize(c);
    const maxX = f.w != null ? f.w - pad - n.w : Infinity;
    const maxY = f.h != null ? f.h - pad - n.h : Infinity;
    return [
      Math.max(minX, Math.min(maxX, x)),
      Math.max(minY, Math.min(maxY, y)),
    ];
  }

  function overlaps(n: Box, x: number, y: number, o: Box) {
    const g = opt.gap;
    return x < o.x + o.w + g && x + n.w + g > o.x &&
           y < o.y + o.h + g && y + n.h + g > o.y;
  }

  function collides(n: Box, x: number, y: number) {
    if (!inNest(n)) return false;
    return siblings(n).some(o => o !== n && o.placed && overlaps(n, x, y, o));
  }

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
        if (p === o || p === m || !p.placed || !overlaps(o, o.x, o.y, p)) continue;
        // 押した相手の先（下か右）にあるものだけ、続けて押す
        const ahead = dir === "down" ? p.y >= origY - 0.5 : p.x >= origX - 0.5;
        if (!ahead || !push(p, dir, o, depth + 1)) return false;
      }
      return true;
    };
    for (const o of siblings(m)) {
      if (o === m || !o.placed || !overlaps(m, m.x, m.y, o)) continue;
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
      if (stuck || settleChain(n, before, moved)) return true;
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

  // ---- 配置 ----

  // 親の中で、左上から格子状に空きを探す
  function findGridSpot(n: Box): [number, number] {
    const c = containerOf(n);
    const sibs = siblings(n);
    const a = innerArea(c);
    const cw = Math.max(...sibs.map(s => s.w)) + opt.gap;
    const ch = Math.max(...sibs.map(s => s.h)) + opt.gap;
    const f = fixedSize(c);
    let cols = Math.max(1, Math.ceil(Math.sqrt(sibs.length)));
    if (f.w != null) cols = Math.max(1, Math.min(cols, Math.floor((f.w - a.left - a.right + opt.gap) / cw)));
    for (let i = 0; i < 10000; i++) {
      const x = a.left + (i % cols) * cw;
      const y = a.top + Math.floor(i / cols) * ch;
      if (!collides(n, x, y)) return [x, y];
    }
    return [a.left, a.top];
  }

  // ワールド内で (x, y) に近い空きを探す
  function findFreeSpot(n: Box, x: number, y: number): [number, number] {
    const maxR = Math.max(world.w, world.h);
    for (let r = 0; r <= maxR; r += 16) {
      const step = r === 0 ? 360 : Math.max(5, 360 / (r / 4));
      for (let a = 0; a < 360; a += step) {
        const [cx, cy] = clamp(n,
          x + r * Math.cos((a * Math.PI) / 180),
          y + r * Math.sin((a * Math.PI) / 180));
        if (!collides(n, cx, cy)) return [cx, cy];
      }
    }
    return [x, y]; // 置き場が無いほど狭い場合は重なりを許容する
  }

  // 位置指定のあるものを優先して1つずつ置き、重なるものは空きへ逃がす
  // first を指定すると、それを最初に置く（変更したボックスをその場に残し、相手の方をずらすため）
  function placeGroup(list: Box[], spot: (n: Box) => [number, number], first?: Box) {
    for (const n of list) n.placed = false;
    const rest = list.filter(n => n !== first);
    const order = (first && list.includes(first) ? [first] : [])
      .concat(rest.filter(n => n.hasPos), rest.filter(n => !n.hasPos));
    for (const n of order) {
      [n.x, n.y] = clamp(n, n.x, n.y);
      if (!n.hasPos || collides(n, n.x, n.y)) [n.x, n.y] = spot(n);
      n.placed = true;
      n.hasPos = true;
    }
  }

  // 子から順に大きさと配置を決める
  // keep は変更したボックスとその祖先。重なったときはこれらをその場に残し、相手の方をずらす。
  // 位置のある子が重なったら同じ x のまま下へずらし、位置の無い子は左上から空きを探す
  function settleTree(n: Box, keep?: Set<Box>) {
    n.children.forEach(c => settleTree(c, keep));
    if (isNesting(n)) {
      placeGroup(n.children, c => (c.hasPos ? spotBelow(c) : findGridSpot(c)), n.children.find(c => keep?.has(c)));
    }
    fit(n);
  }

  // 位置のあるボックスが重なったら、同じ x のまま下へずらす（周りを探すより元の並びが崩れにくい）。
  // 位置の無いボックスは、置こうとした場所の近くの空きを探す
  function settleRoots(first?: Box) {
    placeGroup(roots(), n => (n.hasPos ? spotBelow(n) : findFreeSpot(n, n.x, n.y)), first);
  }

  function spotBelow(n: Box): [number, number] {
    let y = n.y;
    // 親の高さが決まっていれば（ワールドの高さの指定や、切り詰める枠）、下にも限りがある
    const c = containerOf(n);
    const f = fixedSize(c);
    const maxY = f.h != null ? f.h - (c.isWorld ? 0 : opt.padding) - n.h : Infinity;
    while (collides(n, n.x, y) && y <= maxY) y += opt.gap;
    if (y <= maxY) return [n.x, y];
    return c.isWorld ? findFreeSpot(n, n.x, n.y) : findGridSpot(n);
  }

  // 大きさが変わる前の本体の位置を覚え、変わったあとの n の位置を返す関数を作る。
  // 線でつながる相手が片側にだけいれば、その側の辺を動かさない（線の長さも角度も変わらない）。
  // 両側にいるか、相手がいなければ中心を保つ。横と縦は別々に決める
  function anchorPlan(n: Box) {
    const l = n.x + n.hx, t = n.y + n.hy, r = l + n.hw, b = t + n.hh;
    const others = incident(n)
      .filter(e => e.a.parent === e.b.parent)
      .map(e => other(e, n))
      .map(o => { const a = anchorRect(o); return [o.x + a.x + a.w / 2, o.y + a.y + a.h / 2] as const; });
    const side = (lo: number, hi: number, vs: number[]) => {
      const before = vs.some(v => v < lo), after = vs.some(v => v > hi);
      return before && !after ? "start" : after && !before ? "end" : "center";
    };
    const sx = side(l, r, others.map(o => o[0])), sy = side(t, b, others.map(o => o[1]));
    return {
      x: (m: Box) => (sx === "start" ? l - m.hx : sx === "end" ? r - m.hx - m.hw : (l + r) / 2 - m.hx - m.hw / 2),
      y: (m: Box) => (sy === "start" ? t - m.hy : sy === "end" ? b - m.hy - m.hh : (t + b) / 2 - m.hy - m.hh / 2),
    };
  }

  // 広がった n が、自分より大きい兄弟にぶつかったら、n の方が動く量の一番少ない向きへずれる
  // （大きい方を動かすと全体が崩れるため）。自分より小さい兄弟は、このあと settleAll で下へずらされる
  function stepAside(n: Box) {
    if (!inNest(n)) return;
    const area = (b: Box) => b.w * b.h;
    const g = opt.gap;
    for (let i = 0; i < 8; i++) {
      const hit = siblings(n).find(o => o !== n && area(o) >= area(n) && overlaps(n, n.x, n.y, o));
      if (!hit) return;
      const cands: [number, number][] = [
        [hit.x + hit.w + g, n.y], [hit.x - g - n.w, n.y], [n.x, hit.y + hit.h + g], [n.x, hit.y - g - n.h],
      ].map(([x, y]) => clamp(n, x!, y!));
      const dist = ([x, y]: [number, number]) => Math.hypot(x - n.x, y - n.y);
      // 大きい兄弟とは重ならない位置のうち、一番近いもの
      const ok = cands
        .filter(([x, y]) => !siblings(n).some(o => o !== n && area(o) >= area(n) && overlaps(n, x, y, o)))
        .sort((a, b) => dist(a) - dist(b))[0];
      if (!ok) return;
      [n.x, n.y] = ok;
    }
  }

  // 大きさが変わったあとに、全体を重なりの無い状態へ直す。changed は変更したボックス（その最上位をその場に残す）
  function settleAll(changed?: Box) {
    const keep = changed ? new Set([changed, ...ancestors(changed)]) : undefined;
    roots().forEach(r => settleTree(r, keep));
    syncWorld();
    settleRoots(changed ? (ancestors(changed).pop() ?? changed) : undefined);
    syncWorld();
  }

  // 最初の配置。位置の無い最上位のボックスは円形に並べる
  function layout(fit = true) {
    roots().forEach(r => settleTree(r));
    syncWorld();
    const auto = roots().filter(n => !n.hasPos);
    const R = Math.min(world.w, world.h) * 0.3 + 40;
    auto.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / auto.length;
      n.x = world.w / 2 + R * Math.cos(a) - n.w / 2;
      n.y = world.h / 2 + R * Math.sin(a) - n.h / 2;
    });
    settleRoots();
    syncWorld();
    if (fit) fitToViewport();
  }

  // 読み込んだ直後だけ、表示領域の右にはみ出した最上位のボックスを下へ移す（横スクロールより縦の方が見やすい）。
  // つながる相手が表示領域に収まっていれば、その真下に中心をそろえて置く。無ければ全体の一番下の左端に置く。
  // 表示の上だけで動かし、ファイルには次に編集したときに保存される。
  // ワールドの幅が指定されている、表示領域より大きい、または左端が表示領域の左半分にあるボックスは動かさない
  // （左から始まる大きなボックスが少しはみ出しただけなら、動かすと全体の並びが崩れる）
  function fitToViewport() {
    const limit = container.clientWidth - opt.padding;
    if (world.src.width || limit <= 0) return;
    const inside = (n: Box) => n.x + n.w <= limit;
    const centerOffset = (n: Box) => { const r = anchorRect(n); return r.x + r.w / 2; };
    const over = roots()
      .filter(n => !inside(n) && n.w <= limit - opt.padding && n.x >= limit / 2)
      .sort((a, b) => a.x - b.x);
    if (!over.length) return;
    for (const n of over) {
      const anchor = incident(n).map(e => other(e, n)).find(o => !o.parent && inside(o));
      const minX = opt.padding, maxX = limit - n.w;
      const x = anchor
        ? Math.max(minX, Math.min(maxX, anchor.x + centerOffset(anchor) - centerOffset(n)))
        : minX;
      let y = anchor
        ? anchor.y + anchor.h + opt.treeGapY
        : Math.max(...roots().filter(o => o !== n && inside(o)).map(o => o.y + o.h), 0) + opt.treeGapY;
      // ぶつかれば下へずらす
      while (collides(n, x, y)) y += opt.gap;
      n.x = x;
      n.y = y;
    }
    syncWorld();
  }

  // ---- 子の大きさをそろえる ----

  // そろえられる子。S は大きさが固定、スティックマンは文字で幅が決まり、
  // ツリーや非表示で子を見せているボックスは子の並びで大きさが決まるので除く
  function sizable(n: Box): Box[] {
    if (!isNesting(n)) return [];
    return n.children.filter(k =>
      sizeOf(k) !== "S" && shapeOf(k) !== "person" && !(k.children.length && viewOf(k) !== "nest"));
  }

  // 大きさの指定を外して、今の中身の配置のまま収まる大きさを測る（文字だけのボックスは既定の大きさ）
  function naturalSize(k: Box, dim: "w" | "h") {
    const [sw, sh] = [k.specW, k.specH];
    if (dim === "w") k.specW = 0;
    else k.specH = 0;
    fit(k);
    const v = dim === "w" ? k.w : k.h;
    [k.specW, k.specH] = [sw, sh];
    fit(k);
    return v;
  }

  // 中身を詰め直してもこれより小さくできない大きさ（一番大きい中身が入る大きさ）
  function minimumSize(k: Box, dim: "w" | "h") {
    if (!isNesting(k)) return naturalSize(k, dim);
    const a = innerArea(k);
    return dim === "w"
      ? Math.max(SIZES.L.w, a.left + a.right + Math.max(...k.children.map(g => g.w)))
      : Math.max(SIZES.L.h, a.top + a.bottom + Math.max(...k.children.map(g => g.h)));
  }

  // 内包している k の中身を、大きさ limit に収まるよう詰め直す。
  // 幅なら右にはみ出す中身を左へ寄せ、重なったら下へずらす。高さなら上へ寄せ、重なったら右へずらす
  function compress(k: Box, dim: "w" | "h", limit: number) {
    if (!isNesting(k)) return;
    const a = innerArea(k);
    const kids = [...k.children].sort((p, q) => (dim === "w" ? p.y - q.y || p.x - q.x : p.x - q.x || p.y - q.y));
    for (const g of kids) {
      if (dim === "w" && g.x + g.w > limit - a.right) g.x = Math.max(a.left, limit - a.right - g.w);
      if (dim === "h" && g.y + g.h > limit - a.bottom) g.y = Math.max(a.top, limit - a.bottom - g.h);
      g.placed = false;
    }
    for (const g of kids) {
      while (collides(g, g.x, g.y)) {
        if (dim === "w") g.y += opt.gap;
        else g.x += opt.gap;
      }
      g.placed = true;
    }
    fit(k);
  }

  return {
    containerOf, siblings, incident, innerArea, fixedSize, syncWorld,
    measure, fitHead, layoutTree, anchorRect, fit, refitAncestors,
    clamp, clamped, overlaps, collides, validChain, pushAway, settleChain, tryMove,
    findGridSpot, findFreeSpot, placeGroup, settleTree, settleRoots, spotBelow, anchorPlan, stepAside,
    settleAll, layout, fitToViewport,
    sizable, naturalSize, minimumSize, compress,
  };
}
