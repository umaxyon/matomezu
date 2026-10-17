// 大きさが変わったときの押し込み（docs/PAPER-plan.md の 4.6）。試しに並べずに、計算だけで「形を変えずに収まるか」と
// 「どの箱をどれだけ動かすか」を出す純粋な関数。画面にも、テーマにも、配置の状態にも触らない（CLAUDE.md の 9）。
//
// 決まり:
// - 箱はページの起点（growFrom。start は左・上を保つ、center は真ん中を保つ）から大きさを変える
// - ぶつかる相手は同じ向きにだけ押す（横の並びの相手は横へ、縦の並びの相手は縦へ）。押されて段が変わる（折り返す）ことはしない
// - どの組がどちらの向きの並びかは、変わる前の位置で決める（横に離れて上下が重なる組は横、縦に離れて左右が重なる組は縦。
//   斜めに離れた組は、離れている方の向き。斜めの組は、近づいて反対の向きでも重なったときだけ押し合う）
// - 間隔の下限は gapOf(a, b)（layout.ts の gapBetween。線なし 8・線あり 32・キャプションあり 40）
// - 親の中に余裕があれば、起点と反対側の余裕も使って内側へ詰める。それでも入らなければ、グループは起点に従って広がる。
//   紙（固定の大きさのワールド）は広がれないので、入らなければ fits: false
// - 一番内側の入れ物から順に決め、広がったグループは、親の中で育った箱として同じように押し込む
// - 押される前にいた位置（home）があれば、そこから押す。相手が縮めば、押された分だけ戻る（4.6 の 8）
//
//   canSqueeze(root, opt)
//   // → { fits: true, boxes: Map<id, { x, y, w, h }> }  箱ごとの新しい足跡（親の左上から）。大きさの変わらない入れ物の中の箱も含む。
//   //   子を自由に置く箱の大きさは、置いた子の右下に余白を足した大きさ（中身から決まる。D7）
//   // → { fits: false, axis, chain, short }             入らなかった向き・端から端へつながった箱の列・足りない px

export type SqId = string | number;
export type SqFrom = "start" | "center";
export interface SqInner { left: number; top: number; right: number; bottom: number }

export interface SqBox {
  id: SqId;
  x: number; y: number; w: number; h: number; // 今の足跡（親の左上から）
  nw?: number; nh?: number;                    // 新しい足跡の大きさ（子を自由に置く箱は書かない。子から決まる）
  kids?: SqBox[];                              // 子を自由に置く箱（内包・フローチャート）の子。並べ方が決まる箱（リスト・ツリーなど）は nw・nh で渡す
  inner?: SqInner;                             // kids があるとき、子を置ける範囲（自分の左上から。right・bottom は room の大きさでの値）
  room?: { w: number; h: number };             // kids があるとき、子を置き始める大きさ（無ければ w・h）。子を自由に置く箱になったばかりなら、子の位置から決まる大きさ
  minW?: number; minH?: number;                // kids があるとき、中身によらない最小の大きさ（本文の幅など）。今より大きければ、その分は起点に従って広がる
  home?: { x?: number; y?: number };           // 押される前にいた位置（無ければ今の位置）。ここから押すので、相手が縮めば押された分だけ戻り、ここより先へは動かない
}

export interface SqRoot {
  kids: SqBox[];
  inner: SqInner;  // 子を置ける範囲（紙なら紙のふちから余白の分だけ内側）
  fixed: boolean;  // 大きさが決まっている（紙）。決まっていなければ、グループと同じく広がる
}

export interface SqOptions {
  from: { x: SqFrom; y: SqFrom };    // ページの起点（STRATEGIES の growFrom）
  gapOf(a: SqId, b: SqId): number;   // 兄弟どうしの間隔の下限（呼ぶ側が layout.ts の gapBetween を渡す）
}

export type SqResult =
  | { fits: true; boxes: Map<SqId, { x: number; y: number; w: number; h: number }> }
  | { fits: false; axis: "x" | "y"; chain: SqId[]; short: number };

type Axis = "x" | "y";
const SIZE = { x: "w", y: "h" } as const;
const OTHER = { x: "y", y: "x" } as const;
const LO = { x: "left", y: "top" } as const;
const HI = { x: "right", y: "bottom" } as const;
// 0.5px 未満のずれは数えない（layout.ts の outsideFixed と同じ）
const EPS = 0.5;
// 横と縦を交互に決め直す回数の上限（補正値は数 px なので、ふつうは 2〜3 回で止まる。止まらなければ入らないとみなす）
const ROUNDS = 8;

interface Item {
  id: SqId;
  old: { x: number; y: number; w: number; h: number };
  w: number; h: number;     // 新しい大きさ
  want: { x: number; y: number }; // 起点から大きさを変えた位置（押す前）
  x: number; y: number;     // 決めた位置
}

// 組ごとの並びの向きと順（a が前）。変わる前の位置で決める
interface Pair { a: Item; b: Item; axis: Axis; gap: number }

function pairsOf(items: Item[], gapOf: SqOptions["gapOf"]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const p = items[i]!, q = items[j]!;
      const sep = (ax: Axis) => {
        const s = SIZE[ax];
        return Math.max(q.old[ax] - (p.old[ax] + p.old[s]), p.old[ax] - (q.old[ax] + q.old[s]));
      };
      const sx = sep("x"), sy = sep("y");
      if (sx < 0 && sy < 0) continue; // 前から重なっていた組（データの誤り）は押し合わない
      const axis: Axis = sx >= 0 && (sy < 0 || sx >= sy) ? "x" : "y";
      const [a, b] = p.old[axis] <= q.old[axis] ? [p, q] : [q, p];
      pairs.push({ a, b, axis, gap: gapOf(p.id, q.id) });
    }
  }
  return pairs;
}

// 組が今その向きで押し合うか（反対の向きの範囲が、間隔を含めて重なっているか。layout.ts の overlaps と同じ）
function active(p: Pair): boolean {
  const o = OTHER[p.axis], s = SIZE[o];
  return p.a[o] < p.b[o] + p.b[s] + p.gap && p.b[o] < p.a[o] + p.a[s] + p.gap;
}

// 1 つの向きで位置を決める。lo・hi は子を置ける範囲。収まらなければ、足りない px と端から端への列を返す
function solveAxis(items: Item[], pairs: Pair[], ax: Axis, from: SqFrom, lo: number, hi: number):
  { ok: true } | { ok: false; short: number; chain: SqId[] } {
  const s = SIZE[ax];
  const on = pairs.filter(p => p.axis === ax && active(p));
  const order = [...items].sort((p, q) => p.old[ax] - q.old[ax] || String(p.id).localeCompare(String(q.id)));
  const before = new Map<Item, Pair[]>(), after = new Map<Item, Pair[]>();
  for (const p of on) {
    (before.get(p.b) ?? before.set(p.b, []).get(p.b)!).push(p);
    (after.get(p.a) ?? after.set(p.a, []).get(p.a)!).push(p);
  }
  // 端から詰めたときの長さ（入るかの判定と、入らないときの列）
  const reach = new Map<Item, { end: number; prev: Item | null }>();
  for (const it of order) {
    let start = lo, prev: Item | null = null;
    for (const p of before.get(it) ?? []) {
      const e = reach.get(p.a)!.end + p.gap;
      if (e > start) { start = e; prev = p.a; }
    }
    reach.set(it, { end: start + it[s], prev });
  }
  let last: Item | null = null;
  for (const it of order) if (!last || reach.get(it)!.end > reach.get(last)!.end) last = it;
  const need = last ? reach.get(last)!.end : lo;
  if (need > hi + EPS) {
    const chain: SqId[] = [];
    for (let it: Item | null = last; it; it = reach.get(it)!.prev) chain.unshift(it.id);
    return { ok: false, short: need - hi, chain };
  }
  // 後ろへ押した位置（起点が start の向き）と、前へ押した位置。真ん中を保つなら平均（どちらも組の決まりを満たすので、平均も満たす）
  const pushBack = new Map<Item, number>(), pushFront = new Map<Item, number>();
  for (const it of order) {
    let v = it.want[ax];
    for (const p of before.get(it) ?? []) v = Math.max(v, pushBack.get(p.a)! + p.a[s] + p.gap);
    pushBack.set(it, v);
  }
  for (const it of [...order].reverse()) {
    let v = it.want[ax];
    for (const p of after.get(it) ?? []) v = Math.min(v, pushFront.get(p.b)! - it[s] - p.gap);
    pushFront.set(it, v);
  }
  for (const it of order) it[ax] = from === "center" ? (pushBack.get(it)! + pushFront.get(it)!) / 2 : pushBack.get(it)!;
  // 範囲の後ろの端からはみ出す分を前へ（余裕を使って内側へ）、前の端からはみ出す分を後ろへ戻す
  for (const it of [...order].reverse()) {
    let v = Math.min(it[ax], hi - it[s]);
    for (const p of after.get(it) ?? []) v = Math.min(v, p.b[ax] - it[s] - p.gap);
    it[ax] = v;
  }
  for (const it of order) {
    let v = Math.max(it[ax], lo);
    for (const p of before.get(it) ?? []) v = Math.max(v, p.a[ax] + p.a[s] + p.gap);
    it[ax] = v;
  }
  return { ok: true };
}

type Placed = { w: number; h: number; shift: { x: number; y: number } } | { fail: { axis: Axis; chain: SqId[]; short: number } };

// 入れ物の子を決める。返すのは入れ物の新しい大きさと、広がった分だけ起点からずらす量（親の中で育った箱として使う）
function place(kids: SqBox[], inner: SqInner, size: { w: number; h: number }, grows: boolean, opt: SqOptions,
  out: Map<SqId, { x: number; y: number; w: number; h: number }>, min?: { w?: number; h?: number }): Placed {
  const items: Item[] = [];
  for (const k of kids) {
    let w = k.nw ?? k.w, h = k.nh ?? k.h, shift = { x: 0, y: 0 };
    if (k.kids) {
      const room = k.room ?? { w: k.w, h: k.h };
      const r = place(k.kids, k.inner ?? { left: 0, top: 0, right: room.w, bottom: room.h }, room, true, opt, out, { w: k.minW, h: k.minH });
      if ("fail" in r) return r;
      ({ w, h, shift } = r);
    }
    // 起点から大きさを変えた位置。グループは、広がった向きの分（shift）だけ前へずれる。ほかの箱は起点が center なら半分前へ
    const grown = (ax: Axis, d: number) => (opt.from[ax] === "center" ? d / 2 : 0);
    const at = { x: k.home?.x ?? k.x, y: k.home?.y ?? k.y };
    const want = k.kids
      ? { x: at.x - shift.x, y: at.y - shift.y }
      : { x: at.x - grown("x", w - k.w), y: at.y - grown("y", h - k.h) };
    items.push({ id: k.id, old: { x: k.x, y: k.y, w: k.w, h: k.h }, w, h, want, x: want.x, y: want.y });
  }
  const pairs = pairsOf(items, opt.gapOf);
  const range = { ...inner };
  // 起点に従って d だけ広がる（start は後ろへだけ、center は両側へ半分ずつ）
  const grow = (ax: Axis, d: number) => {
    if (opt.from[ax] === "center") range[LO[ax]] -= d / 2;
    range[HI[ax]] += opt.from[ax] === "center" ? d / 2 : d;
  };
  for (const ax of ["x", "y"] as const) {
    const d = (min?.[SIZE[ax]] ?? 0) - size[SIZE[ax]];
    if (grows && d > EPS) grow(ax, d);
  }
  let settled = false;
  for (let round = 0; round < ROUNDS && !settled; round++) {
    const was = items.map(it => [it.x, it.y]);
    for (const ax of ["x", "y"] as const) {
      let r = solveAxis(items, pairs, ax, opt.from[ax], range[LO[ax]], range[HI[ax]]);
      if (!r.ok && grows) {
        // 詰めても入らない: 起点に従って広がる
        grow(ax, r.short);
        r = solveAxis(items, pairs, ax, opt.from[ax], range[LO[ax]], range[HI[ax]]);
      }
      if (!r.ok) return { fail: { axis: ax, chain: r.chain, short: r.short } };
    }
    settled = items.every((it, i) => Math.abs(it.x - was[i]![0]!) < EPS && Math.abs(it.y - was[i]![1]!) < EPS);
  }
  if (!settled) {
    const it = items[0]!;
    return { fail: { axis: "x", chain: [it.id], short: 0 } };
  }
  // 前へ広がった分は、入れ物の左上がずれるので、子の位置を戻して入れ物を前へずらす
  const shift = { x: inner.left - range.left, y: inner.top - range.top };
  for (const it of items) out.set(it.id, { x: it.x + shift.x, y: it.y + shift.y, w: it.w, h: it.h });
  // 大きさは中身から決まる（D7）: 置いた子の右下に余白を足した大きさと、最小の大きさの大きい方。中身が縮めば入れ物も縮む
  if (!items.length) return { w: Math.max(min?.w ?? 0, size.w), h: Math.max(min?.h ?? 0, size.h), shift };
  const padR = size.w - inner.right, padB = size.h - inner.bottom;
  const w = Math.max(min?.w ?? 0, ...items.map(it => it.x + shift.x + it.w + padR));
  const h = Math.max(min?.h ?? 0, ...items.map(it => it.y + shift.y + it.h + padB));
  return { w, h, shift };
}

export function canSqueeze(root: SqRoot, opt: SqOptions): SqResult {
  const boxes = new Map<SqId, { x: number; y: number; w: number; h: number }>();
  const size = { w: root.inner.right, h: root.inner.bottom };
  const r = place(root.kids, root.inner, size, !root.fixed, opt, boxes);
  if ("fail" in r) return { fits: false, ...r.fail };
  return { fits: true, boxes };
}
