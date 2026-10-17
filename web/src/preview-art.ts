// ページの絵（四角と線だけの縮図）。ミニマップ（minimap.ts）と、リンクの箱の窓（link-box.ts。docs/PATTERN-plan.md の D27 段階 4）が同じ描き方で使う。
// 絵のもと（Scene）は配置の結果（report.ts の Geometry）から作る。描くのは SVG で、見せる範囲は viewBox で切り取る。
// 色はデータの値なので、文字列の HTML にせず要素の属性として入れる
import { SVGNS } from "./dom";
import type { Pt, Rect } from "./geom";
import type { Geometry } from "./report";

export interface SceneBox { x: number; y: number; w: number; h: number; color: string | null; outline: boolean }
export interface Scene {
  w: number; h: number;        // 中身の範囲（左上は 0,0）
  bg: string | null;           // 背景色（無ければ null）
  boxes: SceneBox[];           // 親から先（子が上に来る）
  edges: { points: Pt[] }[];
}

// 白（既定の色）は明るいテーマで背景に溶けるので、テーマに合わせた色（CSS の --mm-box）にする
const isWhite = (c: string) => /^#?f{3}(f{3})?$/i.test(c);

// 配置の結果から絵のもとを作る。子を持つ箱（内包）は枠だけ、ツリーで並ぶ箱は本体とツリーの線、それ以外は塗る。塗らない箱は枠だけにし、
// 塗らず枠も無い箱（見出しの文字だけの箱など）は描かない（図と同じ見え方。2026-10-12 ユーザー）。
// 中身の範囲は、箱と線の右端・下端（表示領域の大きさではなく、中身の大きさ）。
// without があれば、その箱を描かず、残りの中身が左上に来るように寄せる（リストの子の中身の縮図。箱自身の枠は映さない。D13）
export function sceneOf(g: Geometry, bg: string | null, without?: string): Scene {
  const boxes: SceneBox[] = [];
  let w = 0, h = 0;
  const byId = new Map(g.boxes.map(b => [b.id, b]));
  for (const raw of g.boxes) {
    if (without != null && raw.id === without) continue;
    // スクロールしているリスト（D33）の中の箱は、リストの枠で切る（一部だけ見えている行がリストの外へはみ出さない）
    const b = clipToLists(raw, byId);
    if (!b) continue;
    w = Math.max(w, b.x + b.w);
    h = Math.max(h, b.y + b.h);
    if (b.fill === false && b.border === false) continue;
    const color = b.color && !isWhite(b.color) ? b.color : null;
    // ツリーで並ぶ箱は、部分木の枠ではなく本体を描く（線はツリーの線で結ぶ）
    if (b.head) { boxes.push({ ...b.head, color, outline: b.fill === false }); continue; }
    const outline = (!!b.kids && b.view !== "hidden" && b.view !== "preview") || b.fill === false;
    boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h, color, outline });
  }
  const edges = [...g.edges.map(e => e.points), ...(g.treeLines ?? [])].map(points => ({ points: points.map(p => [...p] as Pt) }));
  for (const e of edges) for (const [x, y] of e.points) { w = Math.max(w, x); h = Math.max(h, y); }
  const scene = { w: Math.max(1, w), h: Math.max(1, h), bg, boxes, edges };
  return without != null ? trimScene(scene) : scene;
}
type GeoBox = Geometry["boxes"][number];
function clipToLists(b: GeoBox, byId: Map<GeoBox["id"], GeoBox>): GeoBox | null {
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  for (const id of b.ancestors) {
    const a = byId.get(id);
    if (!a?.scroll) continue;
    x0 = Math.max(x0, a.x); y0 = Math.max(y0, a.y);
    x1 = Math.min(x1, a.x + a.w); y1 = Math.min(y1, a.y + a.h);
  }
  if (x1 <= x0 || y1 <= y0) return null;
  return x0 === b.x && y0 === b.y && x1 === b.x + b.w && y1 === b.y + b.h ? b : { ...b, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// 中身を左上（余白 TRIM_PAD）に寄せる
const TRIM_PAD = 6;
function trimScene(s: Scene): Scene {
  const xs = [...s.boxes.map(b => b.x), ...s.edges.flatMap(e => e.points.map(p => p[0]))];
  const ys = [...s.boxes.map(b => b.y), ...s.edges.flatMap(e => e.points.map(p => p[1]))];
  if (!xs.length) return { ...s, w: 1, h: 1 };
  const dx = TRIM_PAD - Math.min(...xs), dy = TRIM_PAD - Math.min(...ys);
  return {
    w: s.w + dx + TRIM_PAD, h: s.h + dy + TRIM_PAD, bg: s.bg,
    boxes: s.boxes.map(b => ({ ...b, x: b.x + dx, y: b.y + dy })),
    edges: s.edges.map(e => ({ points: e.points.map(([x, y]) => [x + dx, y + dy] as Pt) })),
  };
}

export function make(tag: string, cls: string, attrs: Record<string, string | number>): SVGElement {
  const x = document.createElementNS(SVGNS, tag);
  x.setAttribute("class", cls);
  for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, String(v));
  return x;
}

// 絵の要素（背景・線・箱）。bgRect は背景を塗る範囲（無ければ中身の範囲）
export function sceneItems(s: Scene, bgRect: Rect = { x: 0, y: 0, w: s.w, h: s.h }): SVGElement[] {
  const items: SVGElement[] = [];
  if (s.bg) {
    const r = make("rect", "mm-bg", { x: bgRect.x, y: bgRect.y, width: bgRect.w, height: bgRect.h });
    r.style.setProperty("fill", s.bg);
    items.push(r);
  }
  for (const e of s.edges) items.push(make("polyline", "mm-edge", { points: e.points.map(p => p.join(",")).join(" ") }));
  for (const b of s.boxes) {
    const r = make("rect", b.outline ? "mm-group" : "mm-box", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 });
    r.style.setProperty(b.outline ? "stroke" : "fill", b.color ?? "var(--mm-box)");
    if (b.outline) r.setAttribute("vector-effect", "non-scaling-stroke");
    items.push(r);
  }
  return items;
}

// svg に絵を描き、見せる範囲を view にする（width / height は呼ぶ側が決める）。bgRect は背景を塗る範囲（無ければ view 全体）
export function drawScene(svg: SVGSVGElement, s: Scene, view: Rect, extra: SVGElement[] = [], bgRect: Rect = view): void {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  svg.replaceChildren(...sceneItems(s, bgRect), ...extra);
}
// 2 つの四角を囲む四角
export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
