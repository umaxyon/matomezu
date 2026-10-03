// 配置の結果の要約。LLM が図を調整するために読む（matomezu check / set が表示する）。DOM に依存しない。
// 読む量を抑えるため、問題のあるところだけを短い行で返す。

export interface Rect { x: number; y: number; w: number; h: number }

// 見えているボックス。位置はワールドの左上から
export interface GeoBox extends Rect {
  id: string;
  caption: string;
  ancestors: string[]; // 親から順に
  cut: boolean;        // キャプションが … で切れている
  view?: "nest" | "tree" | "hidden"; // 子の見せ方（子があるときだけ）
  kids?: number;       // 子の数（非表示の子も数える）
}

// 見えている線（ツリーの線は含まない）。points は線の点の並び（折れ線なら折れ点を含む）
export type Pt = [number, number];
export interface GeoEdge { id: string; a: string; b: string; points: Pt[] }

export interface Geometry {
  viewport: { w: number; h: number };
  boxes: GeoBox[];
  edges: GeoEdge[];
}

const LABEL_MAX = 12;

// 線は id だけだと両端が分からないので、両端の id を添える（例 e3(1-4)）
const edgeLabel = (e: GeoEdge) => `${e.id}(${e.a}-${e.b})`;

function label(b: GeoBox) {
  const c = b.caption.length > LABEL_MAX ? b.caption.slice(0, LABEL_MAX) + "…" : b.caption;
  return `#${b.id} ${c}`;
}

// 線分どうしが交わるか（端点が触れるだけのものは数えない）
// 線の区間（隣り合う 2 点）の並び
const segments = (e: GeoEdge): [Pt, Pt][] => e.points.slice(1).map((p, i) => [e.points[i]!, p]);

function segCross([[ax1, ay1], [ax2, ay2]]: [Pt, Pt], [[bx1, by1], [bx2, by2]]: [Pt, Pt]) {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(ax1, ay1, ax2, ay2, bx1, by1);
  const d2 = d(ax1, ay1, ax2, ay2, bx2, by2);
  const d3 = d(bx1, by1, bx2, by2, ax1, ay1);
  const d4 = d(bx1, by1, bx2, by2, ax2, ay2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// 2 本の線のどこかの区間どうしが交わるか
const cross = (a: GeoEdge, b: GeoEdge) => segments(a).some(s => segments(b).some(t => segCross(s, t)));

// 線のどこかの区間が矩形の内側を通るか
const through = (e: GeoEdge, r: Rect) => segments(e).some(s => segThrough(s, r));

// 線分が矩形の内側を通るか（縁に触れるだけのものは数えない）
function segThrough([[ex1, ey1], [ex2, ey2]]: [Pt, Pt], r: Rect) {
  const m = 1;
  const x0 = r.x + m, y0 = r.y + m, x1 = r.x + r.w - m, y1 = r.y + r.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang–Barsky で線分を矩形に切り取り、残れば通っている
  const dx = ex2 - ex1, dy = ey2 - ey1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ex1 - x0) && clip(dx, x1 - ex1) && clip(-dy, ey1 - y0) && clip(dy, y1 - ey1) && t0 < t1;
}

// 子のある箱ごとに、子の位置と大きさを 1 行で（matomezu check / set の -in で出す）。位置は親の左上から（データの x, y と同じ）。
// 普段の要約に全部の子を出すと長くなるので、指定された箱の分だけ CLI が出す。子がさらに子を持てば [見せ方 子の数] を添える
export function details(g: Geometry): Record<string, string> {
  const out: Record<string, string> = {};
  const rect = (b: GeoBox, p: GeoBox) => `${Math.round(b.x - p.x)},${Math.round(b.y - p.y)} ${Math.round(b.w)}x${Math.round(b.h)}`;
  const more = (b: GeoBox) => (b.kids ? ` [${b.view} ${b.kids}]` : "");
  for (const p of g.boxes) {
    if (!p.kids) continue;
    const head = `in ${label(p)} (${p.view} ${p.kids}, ${Math.round(p.w)}x${Math.round(p.h)})`;
    const kids = g.boxes.filter(b => b.ancestors[0] === p.id);
    out[p.id] = kids.length
      ? `${head}: ` + kids.map(b => `${label(b)} (${rect(b, p)})${more(b)}`).join("; ")
      : `${head}: children are hidden`;
  }
  return out;
}

export function summarize(g: Geometry): string {
  const byId = new Map(g.boxes.map(b => [b.id, b]));
  const top = g.boxes.filter(b => b.ancestors.length === 0);
  const right = Math.max(0, ...top.map(b => b.x + b.w));
  const bottom = Math.max(0, ...top.map(b => b.y + b.h));
  const { w: vw, h: vh } = g.viewport;
  const lines: string[] = [];

  const over: string[] = [];
  if (right > vw) over.push(`right ${Math.round(right - vw)}`);
  if (bottom > vh) over.push(`bottom ${Math.round(bottom - vh)}`);
  lines.push(`viewport ${vw}x${vh}, content ${Math.round(right)}x${Math.round(bottom)}` + (over.length ? ` → over ${over.join(", ")}` : " → fits"));

  // 最上位のボックスは、動かす判断に要るので常に出す。はみ出しているものに ! を付ける
  const rect = (b: GeoBox) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`;
  const isOut = (b: GeoBox) => b.x + b.w > vw || b.y + b.h > vh;
  lines.push(`top ${top.length}: ` + top.map(b => `${isOut(b) ? "!" : ""}${label(b)} (${rect(b)})`).join("; "));

  // 同じボックスにつながる線どうしは、端で触れるだけなので比べない
  const crosses: string[] = [];
  for (let i = 0; i < g.edges.length; i++) {
    for (let j = i + 1; j < g.edges.length; j++) {
      const a = g.edges[i]!, b = g.edges[j]!;
      if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
      if (cross(a, b)) crosses.push(`${edgeLabel(a)}x${edgeLabel(b)}`);
    }
  }
  if (crosses.length) lines.push(`cross ${crosses.length}: ${crosses.join(" ")}`);

  // 線の両端とその祖先・子孫は、線が通って当然なので除く
  const passes: string[] = [];
  for (const e of g.edges) {
    const ends = [byId.get(e.a), byId.get(e.b)];
    if (!ends[0] || !ends[1]) continue;
    const related = new Set<string>([e.a, e.b, ...ends.flatMap(b => b?.ancestors ?? [])]);
    const hit = g.boxes.filter(b =>
      !related.has(b.id) && !b.ancestors.includes(e.a) && !b.ancestors.includes(e.b) && through(e, b));
    const hitIds = new Set(hit.map(b => b.id));
    // 通ったボックスの子孫まで数えると増えすぎるので、一番外側だけにする
    for (const b of hit) {
      if (!b.ancestors.some(p => hitIds.has(p))) passes.push(`${edgeLabel(e)}>${label(b)}`);
    }
  }
  if (passes.length) lines.push(`through ${passes.length}: ${passes.join("; ")}`);

  const cut = g.boxes.filter(b => b.cut);
  if (cut.length) lines.push(`cut ${cut.length}: ` + cut.map(b => `#${b.id} ${b.caption}`).join("; "));

  return lines.join("\n");
}
