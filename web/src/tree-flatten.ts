// ツリーを平らにして線で引き直す（docs/PATTERN-plan.md の 3.6 章）。ツリーのパターンだけが持つ、戻せない変換（CLAUDE.md のルール 7）。
// 解除（内包に戻す）とは別で、見た目を保ったまま普通の箱と線に変える（元のツリーには戻せない。Undo では戻る）。
// ツリーにした箱 root と子孫を、root の親の直下に今の見た目の位置で並べ、親から子へ 1 本ずつ折れ線を引く。端は辺の真ん中に固定し、
// 腹（親と子の間の区間）を兄弟でそろえるので、ツリーの線と同じ絵になる（親から出る区間は兄弟の線で重なる）。矢印は付けない。
// 今の見た目から決める所（planFlatten）と、データの写しを直す所（applyFlatten）に分ける。作り直すのは graph.ts の rebuildWith
import type { Rect } from "./geom";
import { type Box, type Edge, type World, absPos, absRect, descendants, routeDefaultOf, treeDirOf } from "./model";
import { pageWorld } from "./pages";
import { type RouteInput, framedAround, passes, perimeterAt, pickCandidate, route, routeCandidates } from "./routing";
import type { Diagram, EdgeData } from "./types";

export interface FlattenContext {
  root: Box;              // ツリーの根（world.root）
  world: World;
  edges: Edge[];          // 描いている線
  treeGapY: number;       // ツリーの親と子の縦の間隔（腹の位置）
  usedIds: Set<string>;   // 使っている線の id（ほかのページの線も。新しい線の id と重ならないように）
  routeInputOf(e: Edge): RouteInput;
}

// 書き換える線の exitAt / enterAt / via（null は消す）
type EndsPatch = { exitAt: number | null; enterAt: number | null; via: number[] | null };

export interface FlattenPlan {
  subtree: Box[];
  head: Map<string, Rect>;          // 平らにした箱の位置と大きさ（root の親の左上から。本体だけの箱になる）
  links: EdgeData[];                // 親から子へ引く線
  rerouted: Map<string, EndsPatch>; // 外から root につながる線の直し
}

export function planFlatten(ctx: FlattenContext): FlattenPlan {
  const { root, world } = ctx;
  const dir = treeDirOf(world);
  const subtree = [root, ...descendants(root)];
  // root の親の左上からの、本体の位置と大きさ（平らにすると、どの箱も本体だけの箱になる）
  const [rx, ry] = absPos(root);
  const bx = rx - root.x, by = ry - root.y;
  const head = new Map(subtree.map(n => {
    const [x, y] = absPos(n);
    return [n.id, { x: x - bx + n.hx, y: y - by + n.hy, w: n.hw, h: n.hh }];
  }));
  const half = ctx.treeGapY / 2;
  const used = ctx.usedIds;
  let next = 1;
  const newId = () => { while (used.has("e" + next)) next++; used.add("e" + next); return "e" + next; };
  // 辺の真ん中の、ふち一周の割合（exitAt / enterAt に書く値）
  const rimAt = (r: { w: number; h: number }, side: "t" | "r" | "b" | "l") => {
    const box = { x: 0, y: 0, w: r.w, h: r.h };
    const p: [number, number] = side === "t" ? [r.w / 2, 0] : side === "b" ? [r.w / 2, r.h] : side === "l" ? [0, r.h / 2] : [r.w, r.h / 2];
    return perimeterAt(box, p);
  };
  const [exitSide, enterSide] = ({ down: ["b", "t"], up: ["t", "b"], right: ["r", "l"], left: ["l", "r"] } as const)[dir];
  const links: EdgeData[] = [];
  for (const p of subtree) {
    const pr = head.get(p.id)!;
    const belly = dir === "down" ? pr.y + pr.h + half : dir === "up" ? pr.y - half : dir === "right" ? pr.x + pr.w + half : pr.x - half;
    for (const c of p.children) {
      links.push({
        id: newId(), from: p.src.id!, to: c.src.id!,
        ...(routeDefaultOf(world) !== "elbow" ? { route: "elbow" as const } : {}),
        exitAt: rimAt(pr, exitSide), enterAt: rimAt(head.get(c.id)!, enterSide), via: [Math.round(belly)],
      });
    }
  }
  const rerouted = rerouteAround(ctx, subtree, head, bx, by);
  return { subtree, head, links, rerouted };
}

// データの写し data を、平らにした形に直す（page は今のページ）
export function applyFlatten(data: Diagram, plan: FlattenPlan, page: string | null): void {
  const { subtree, head, links, rerouted } = plan;
  for (const d of data.edges ?? []) {
    if (Array.isArray(d) || !rerouted.has(String(d.id))) continue;
    const p = rerouted.get(String(d.id))!;
    for (const k of ["exitAt", "enterAt", "via"] as const) {
      if (p[k] == null) delete d[k]; else (d as unknown as Record<string, unknown>)[k] = p[k];
    }
  }
  for (const n of subtree) {
    const s = data.nodes.find(x => String(x.id) === n.id);
    if (!s) continue;
    // 根はページの最上位なので、子孫も同じページの最上位に（page はこのページ。無ければ最初のページ）
    delete s.parent;
    if (page != null) s.page = page; else delete s.page;
    const r = head.get(n.id)!;
    s.x = Math.round(r.x);
    s.y = Math.round(r.y);
    // ツリーの中で無視していた見せ方は、平らにすると意味が無くなるので消す（子を持たない箱になる）
    delete s.childView;
  }
  data.edges = [...(data.edges ?? []), ...links];
  // ページのパターンを内包に（根と向きも消す）
  const w = pageWorld(data, page);
  delete w.childView;
  delete w.root;
  delete w.treeDirection;
}

// 平らにすると、外から root につながっていた線は root の本体につながる。自動の道筋のままだと、元の枠の中（子孫の箱の間）を
// 通ることがあるので、そのときは枠の中を通らない道を探し、両端の位置と via を固定して書く（手で直した形と同じく保たれる）。
// 枠の中で通ってよいのは、root の本体から枠の外へまっすぐ出る通り道のうち、ほかの箱に掛からないものだけ。
// 返すのは、書き換える線の id と、その線の exitAt / enterAt / via（null は消す）
function rerouteAround(ctx: FlattenContext, subtree: Box[], head: Map<string, Rect>, bx: number, by: number): Map<string, EndsPatch> {
  const { root } = ctx;
  const out = new Map<string, EndsPatch>();
  const F = absRect(root);
  const abs = (r: Rect) => ({ x: r.x + bx, y: r.y + by, w: r.w, h: r.h });
  const H = abs(head.get(root.id)!);
  const others = subtree.filter(n => n !== root).map(n => abs(head.get(n.id)!));
  const region = framedAround(F, H, others);
  const inside = new Set(subtree);
  for (const e of ctx.edges) {
    const atA = e.a === root && !inside.has(e.b), atB = e.b === root && !inside.has(e.a);
    if (!atA && !atB) continue;
    const base = ctx.routeInputOf(e);
    if (!base.elbow) continue; // 直線は道を選べない
    // 枠に対して決めてあった root の側の端の位置と via は、本体には当てはまらないので捨てる
    const input: RouteInput = {
      ...base, via: null, memory: null,
      ...(atA ? { a: H, exitAt: null } : { b: H, enterAt: null }),
      obstacles: [...base.obstacles, ...others],
    };
    const reset: EndsPatch = { exitAt: input.exitAt ?? null, enterAt: input.enterAt ?? null, via: null };
    const drawn = route(input).points;
    if (!region.some(o => passes(drawn, o))) {
      if (base.via || (atA ? base.exitAt : base.enterAt) != null) out.set(e.id, reset);
      continue;
    }
    const best = pickCandidate(routeCandidates({ ...input, obstacles: [...base.obstacles, ...region] }));
    if (!best) { out.set(e.id, reset); continue; }
    const pts = best.points;
    out.set(e.id, {
      exitAt: perimeterAt(input.a, pts[0]!), enterAt: perimeterAt(input.b, pts[pts.length - 1]!), via: best.shape.via.map(Math.round),
    });
  }
  return out;
}
