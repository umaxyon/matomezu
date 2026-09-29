// 配置の結果の要約。LLM が図を調整するために読む（matomezu check / set が表示する）。DOM に依存しない。
// 読む量を抑えるため、問題のあるところだけを短い行で返す。

export interface Rect { x: number; y: number; w: number; h: number }

// 見えているボックス。位置はワールドの左上から
export interface GeoBox extends Rect {
  id: string;
  caption: string;
  ancestors: string[]; // 親から順に
  cut: boolean;        // キャプションが … で切れている
}

// 見えている線（ツリーの線は含まない）
export interface GeoEdge { id: string; a: string; b: string; x1: number; y1: number; x2: number; y2: number }

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
function cross(a: GeoEdge, b: GeoEdge) {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const d2 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const d3 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const d4 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// 線分が矩形の内側を通るか（縁に触れるだけのものは数えない）
function through(e: GeoEdge, r: Rect) {
  const m = 1;
  const x0 = r.x + m, y0 = r.y + m, x1 = r.x + r.w - m, y1 = r.y + r.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  // Liang–Barsky で線分を矩形に切り取り、残れば通っている
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, e.x1 - x0) && clip(dx, x1 - e.x1) && clip(-dy, e.y1 - y0) && clip(dy, y1 - e.y1) && t0 < t1;
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
