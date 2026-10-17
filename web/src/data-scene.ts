// データだけから作るページの縮図（描いていないページ・ほかのブックの窓）。描いて並べた縮図は offscreen-scene.ts
import { STRATEGIES, treeLinesBetween } from "./model";
import { pageWorld, patternOf } from "./pages";
import { type Rect, centerOf } from "./geom";
import type { Scene } from "./preview-art";
import type { BoxData, Diagram, TreeDirection } from "./types";
import { SIZES, isTreeDirection, normalizeEdge } from "./validate";

// 何も無い縮図（マスターの窓で、まだ読んでいないブック）
export const EMPTY_SCENE: Scene = { w: 1, h: 1, bg: null, boxes: [], edges: [] };
// 近似に使う間隔（graph.ts の DEFAULTS から渡す）
export interface SceneOptions { treeGapX: number; treeGapY: number; padding: number }

// ページの縮図のもとを、データだけから近似で作る（描いていないページ・ほかのブックの窓。graph.pageScene と、マスターの窓（app.ts）が使う）。
// そのページの最上位の箱をデータの位置（無ければ 0,0）と大きさの指定（無ければ M の最小）で置き、最上位どうしの線を中心で結ぶ
export function dataScene(source: Diagram, p: string, opt: SceneOptions): Scene {
  const tops = source.nodes.filter(s => s.parent == null && String(s.page ?? "") === p);
  const hasKids = new Set(source.nodes.filter(s => s.parent != null).map(s => String(s.parent)));
  const rectOf = (s: BoxData) => ({
    x: Number(s.x) || 0, y: Number(s.y) || 0,
    w: Number(s.width) || SIZES.M.minW, h: Number(s.height) || SIZES.M.h,
  });
  const colorOf = (s: BoxData) => (typeof s.color === "string" && /^#/.test(s.color) ? s.color : null);
  const byId = new Map(tops.map(s => [String(s.id), rectOf(s)]));
  const boxes = tops.map(s => ({ ...byId.get(String(s.id))!, color: colorOf(s), outline: hasKids.has(String(s.id)) }));
  const lines: [number, number][][] = [];
  // ツリーのページは、根の子孫を木の形に組む（大きさは近似。根の左上をデータの位置に）
  const pw = pageWorld(source, p);
  const root = STRATEGIES[patternOf(source, p)].descendants && pw.root != null ? tops.find(s => String(s.id) === String(pw.root)) : undefined;
  if (root) {
    const tree = approxTree(source, opt, root, isTreeDirection(pw.treeDirection) ? pw.treeDirection : "down", rectOf);
    boxes.splice(tops.indexOf(root), 1, ...tree.boxes.map(({ s, r }) => ({ ...r, color: colorOf(s), outline: false })));
    byId.set(String(root.id), tree.boxes[0]!.r);
    lines.push(...tree.lines);
  }
  const edges = [...(source.edges ?? []).map(normalizeEdge).flatMap(e => {
    const a = byId.get(String(e.from)), b = byId.get(String(e.to));
    return a && b && a !== b ? [{ points: [centerOf(a), centerOf(b)] }] : [];
  }), ...lines.map(points => ({ points }))];
  const w = Math.max(1, ...boxes.map(b => b.x + b.w)), h = Math.max(1, ...boxes.map(b => b.y + b.h));
  const bg = pw.background;
  return { w, h, bg: typeof bg === "string" && bg ? bg : null, boxes, edges };
}
// 描いていないツリーの近似: 子を副軸に並べ（間隔 treeGapX）、親を子の並びの真ん中に置き、主軸に treeGapY 離す。最初が根
function approxTree(source: Diagram, opt: SceneOptions, root: BoxData, dir: TreeDirection, rectOf: (s: BoxData) => Rect) {
  const kidsOf = (s: BoxData) => source.nodes.filter(k => k.parent != null && String(k.parent) === String(s.id));
  const vertical = dir === "down" || dir === "up";
  const size = (s: BoxData) => { const r = rectOf(s); return vertical ? [r.h, r.w] as const : [r.w, r.h] as const; };
  const spans = new Map<BoxData, number>();
  const span = (s: BoxData): number => {
    const kids = kidsOf(s);
    const all = kids.reduce((t, k) => t + span(k), 0) + opt.treeGapX * Math.max(0, kids.length - 1);
    const v = Math.max(size(s)[1], all);
    spans.set(s, v);
    return v;
  };
  span(root);
  const placed: { s: BoxData; m: number; c: number; main: number; cross: number }[] = [];
  const lines: { parent: number; kids: number[] }[] = [];
  const place = (s: BoxData, m: number, c: number): number => {
    const [main, cross] = size(s);
    const at = placed.push({ s, m, c: c + (spans.get(s)! - cross) / 2, main, cross }) - 1;
    const kids = kidsOf(s);
    const total = kids.reduce((t, k) => t + spans.get(k)!, 0) + opt.treeGapX * Math.max(0, kids.length - 1);
    let kc = c + (spans.get(s)! - total) / 2;
    const ids: number[] = [];
    for (const k of kids) { ids.push(place(k, m + main + opt.treeGapY, kc)); kc += spans.get(k)! + opt.treeGapX; }
    if (ids.length) lines.push({ parent: at, kids: ids });
    return at;
  };
  place(root, 0, 0);
  // 上向き・左向きは主軸を裏返す。木の枠（周りに余白）の左上をデータの位置にそろえる（描いたときの根の位置と同じ）
  const end = Math.max(...placed.map(q => q.m + q.main));
  const forward = dir === "down" || dir === "right";
  const rects = placed.map(q => {
    const m = forward ? q.m : end - q.m - q.main;
    return vertical ? { x: q.c, y: m, w: q.cross, h: q.main } : { x: m, y: q.c, w: q.main, h: q.cross };
  });
  const r0 = rectOf(root);
  const dx = r0.x + opt.padding - Math.min(...rects.map(r => r.x)), dy = r0.y + opt.padding - Math.min(...rects.map(r => r.y));
  for (const r of rects) { r.x += dx; r.y += dy; }
  return {
    boxes: placed.map((q, i) => ({ s: q.s, r: rects[i]! })),
    lines: lines.flatMap(l => treeLinesBetween(dir, rects[l.parent]!, l.kids.map(i => rects[i]!), opt.treeGapY)),
  };
}
