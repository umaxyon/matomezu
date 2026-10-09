// 配置の結果の要約。LLM が図を調整するために読む（matomezu check / set が表示する）。DOM に依存しない。
// 読む量を抑えるため、問題のあるところだけを短い行で返す。

import { type Pt, type Rect, segmentThroughRect, segmentsCross, segmentsOf } from "./geom";

export type { Pt, Rect };

// 見えているボックス。位置はワールドの左上から
export interface GeoBox extends Rect {
  id: string;
  caption: string;
  ancestors: string[]; // 親から順に
  cut: boolean;        // キャプションが … で切れている
  view?: "nest" | "tree" | "hidden" | "list"; // 子の見せ方（子があるときだけ）
  kids?: number;       // 子の数（非表示の子も数える）
  color?: string;      // 箱の色（ミニマップで使う）
}

// 見えている線（ツリーの線は含まない）。points は線の点の並び（折れ線なら折れ点を含む）
// caption と label は線のキャプションと、その札の範囲（ワールドの座標。キャプションがあって描かれているときだけ）
export interface GeoEdge { id: string; a: string; b: string; points: Pt[]; caption?: string; label?: Rect }

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

// 線の区間（隣り合う 2 点）の並び
const segments = (e: GeoEdge) => segmentsOf(e.points);

// 2 本の線のどこかの区間どうしが交わるか
const cross = (a: GeoEdge, b: GeoEdge) => segments(a).some(s => segments(b).some(t => segmentsCross(s, t)));

// 線のどこかの区間が矩形の内側を通るか
const through = (e: GeoEdge, r: Rect) => segments(e).some(s => segmentThroughRect(s, r));

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

  // 線のキャプションの札が重なっている箱（線の両端の祖先は、札が中にあって当然なので除く。一番外側の箱だけ）
  const covered: string[] = [];
  for (const e of g.edges) {
    const r = e.label;
    if (!r) continue;
    const ends = [byId.get(e.a), byId.get(e.b)];
    const outer = new Set<string>(ends.flatMap(b => b?.ancestors ?? []));
    const overlap = (b: GeoBox) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y;
    const hit = g.boxes.filter(b => !outer.has(b.id) && overlap(b));
    const hitIds = new Set(hit.map(b => b.id));
    for (const b of hit) {
      if (!b.ancestors.some(p => hitIds.has(p))) covered.push(`${edgeLabel(e)} ${e.caption ?? ""}>${label(b)}`);
    }
  }
  if (covered.length) lines.push(`label ${covered.length}: ${covered.join("; ")}`);

  const cut = g.boxes.filter(b => b.cut);
  if (cut.length) lines.push(`cut ${cut.length}: ` + cut.map(b => `#${b.id} ${b.caption}`).join("; "));

  return lines.join("\n");
}
