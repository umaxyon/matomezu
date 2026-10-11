// フローチャートの整列（docs/PATTERN-plan.md の 3.7 章。2026-10-11 ユーザー）。箱の大きさと線だけで動く、DOM に依らない関数。
// 本筋（開始の箱から、線をたどって最初の線を選び続けた並び）の中心を 1 本の縦の線 centerX にそろえ、上から段に並べる。
// 分岐の枝は本筋の左右の列に置く（右が先）。段の高さはその段の一番高い箱で決め、箱は段の中で上下の真ん中にそろえる
// （横に並ぶ箱どうしの線もまっすぐになる）。
// 使う所: LLM が位置を書かずにフローチャートを書き出したとき（layout.ts。位置のある箱が 1 つでもあれば使わない）と、
// ユーザーが押す「自動で整列」（graph.ts の alignFlow）。ユーザーが 0 から作るときは使わず、好きに置かせる
//
//   alignFlow([{ id: "1", w: 120, h: 64, start: true }, ...], [{ from: "1", to: "2" }], { centerX: 400, top: 40, gapX: 60, gapY: 48 })
//     → Map { "1" => { x, y }, ... }（左上の位置）

export interface FlowItem { id: string; w: number; h: number; start: boolean } // start: 開始らしい形（角丸・円）
export interface FlowLink { from: string; to: string }
export interface FlowAlignOptions { centerX: number; top: number; gapX: number; gapY: number }

export function alignFlow(items: FlowItem[], links: FlowLink[], o: FlowAlignOptions): Map<string, { x: number; y: number }> {
  const byId = new Map(items.map(i => [i.id, i]));
  const outs = new Map(items.map(i => [i.id, [] as string[]]));
  const ins = new Map(items.map(i => [i.id, 0]));
  for (const l of links) {
    if (l.from === l.to || !byId.has(l.from) || !byId.has(l.to)) continue;
    outs.get(l.from)!.push(l.to);
    ins.set(l.to, ins.get(l.to)! + 1);
  }

  // 始まり: 入る線の無い、開始らしい形の箱。無ければ入る線の無い箱、それも無ければ最初の箱。たどり着けない箱は、その後で別の始まりにする
  const starts = [
    ...items.filter(i => !ins.get(i.id) && i.start), ...items.filter(i => !ins.get(i.id) && !i.start), ...items,
  ].map(i => i.id);

  // 段: 戻る線（たどっている途中の箱へ戻る線）を除いて、一番長い道の長さ。たどった順（後順の逆）で決める
  const state = new Map<string, "on" | "done">();
  const forward = new Map(items.map(i => [i.id, [] as string[]]));
  const post: string[] = [];
  const visit = (u: string) => {
    state.set(u, "on");
    for (const v of outs.get(u)!) {
      if (state.get(v) === "on") continue; // 戻る線
      forward.get(u)!.push(v);
      if (!state.has(v)) visit(v);
    }
    state.set(u, "done");
    post.push(u);
  };
  const roots: string[] = [];
  const segments: string[][] = []; // 始まりごとに、新しくたどった箱
  for (const r of starts) {
    if (state.has(r)) continue;
    const before = post.length;
    roots.push(r);
    visit(r);
    segments.push(post.slice(before));
  }
  const topo = [...post].reverse();
  const layer = new Map(items.map(i => [i.id, 0]));
  for (const u of topo) for (const v of forward.get(u)!) layer.set(v, Math.max(layer.get(v)!, layer.get(u)! + 1));
  // 2 つ目からの始まりでたどった箱は、それまでの箱の下に続ける
  let below = 0;
  for (const seg of segments) {
    const top = Math.min(...seg.map(u => layer.get(u)!));
    for (const u of seg) layer.set(u, layer.get(u)! - top + below);
    below = Math.max(...seg.map(u => layer.get(u)!)) + 1;
  }

  // 列: 本筋は 0。本筋の箱から分かれた枝は右（+1）、次は左（-1）…。枝の先は同じ列に続ける
  const col = new Map<string, number>();
  for (const r of roots) {
    for (let u: string | undefined = r; u && !col.has(u); u = forward.get(u)!.find(v => !col.has(v))) col.set(u, 0);
  }
  const SIDES = [1, -1, 2, -2, 3, -3];
  for (const u of topo) {
    const c = col.get(u) ?? 0;
    let k = 0;
    for (const v of forward.get(u)!) {
      if (col.has(v)) continue;
      col.set(v, c === 0 ? SIDES[Math.min(k++, SIDES.length - 1)]! : c);
    }
  }
  // 同じ段・同じ列に重なったら、外側へずらす
  const taken = new Set<string>();
  for (const u of topo) {
    let c = col.get(u)!;
    while (taken.has(`${layer.get(u)}:${c}`)) c += c >= 0 ? 1 : -1;
    col.set(u, c);
    taken.add(`${layer.get(u)}:${c}`);
  }

  // 位置
  const colW = Math.max(...items.map(i => i.w)) + o.gapX;
  const rows = Math.max(...items.map(i => layer.get(i.id)!)) + 1;
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...items.filter(i => layer.get(i.id) === r).map(i => i.h)));
  const rowTop: number[] = [];
  rowH.reduce((y, h, r) => { rowTop[r] = y; return y + (h ? h + o.gapY : 0); }, o.top);
  const out = new Map<string, { x: number; y: number }>();
  for (const i of items) {
    const r = layer.get(i.id)!;
    out.set(i.id, {
      x: Math.round(o.centerX + col.get(i.id)! * colW - i.w / 2),
      y: Math.round(rowTop[r]! + (rowH[r]! - i.h) / 2),
    });
  }
  return out;

}
