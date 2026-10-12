// フローチャートの整列（docs/PATTERN-plan.md の 3.7 章。2026-10-11 ユーザー）。箱の大きさと線だけで動く、DOM に依らない関数。
// 本筋（開始の箱から、線をたどって下へ続ける子を選び続けた並び）の中心を 1 本の縦の線 centerX にそろえ、上から段に並べる。
// 分岐の枝は本筋の左右の列に置く（右が先）。段の高さはその段の一番高い箱で決め、箱は段の中で上下の真ん中にそろえる
// （横に並ぶ箱どうしの線もまっすぐになる）。
// 分岐から分岐へ続くときは縦につながず、子の分岐を横（右が先）に置く（2026-10-12 ユーザー）。横に置いた分岐は親と同じ段で、
// 親の中心から sideDrop だけ下げる（線は親の横の頂点から出て、子の分岐の上の頂点に入る。入り口は graph.ts の autoAlign が上に決める）。
// 分岐の下へ続ける子は、分岐でない子のうち最初のもの（分岐の子しか無ければ、下へは続けない）。分岐でない箱から分岐へは、今までどおり下へ続ける。
// 使う所: LLM が位置を書かずにフローチャートを書き出したとき（layout.ts。位置のある箱が 1 つでもあれば使わない）と、
// ユーザーが押す「自動で整列」（graph.ts の alignFlow）。ユーザーが 0 から作るときは使わず、好きに置かせる
//
//   alignFlow([{ id: "1", w: 120, h: 64, start: true, branch: false }, ...], [{ from: "1", to: "2" }],
//     { centerX: 400, top: 40, gapX: 60, gapY: 48, sideDrop: 24 })
//     → Map { "1" => { x, y }, ... }（左上の位置）

export interface FlowItem { id: string; w: number; h: number; start: boolean; branch: boolean } // start: 開始らしい形（角丸・円）。branch: 分岐の形（ひし形）
export interface FlowLink { from: string; to: string }
export interface FlowAlignOptions { centerX: number; top: number; gapX: number; gapY: number; sideDrop: number }

export function alignFlow(items: FlowItem[], links: FlowLink[], o: FlowAlignOptions): Map<string, { x: number; y: number }> {
  const byId = new Map(items.map(i => [i.id, i]));
  const outs = new Map(items.map(i => [i.id, [] as string[]]));
  const ins = new Map(items.map(i => [i.id, 0]));
  for (const l of links) {
    if (l.from === l.to || !byId.has(l.from) || !byId.has(l.to)) continue;
    outs.get(l.from)!.push(l.to);
    ins.set(l.to, ins.get(l.to)! + 1);
  }
  const branch = (id: string) => byId.get(id)!.branch;
  // 横に置く線（分岐から分岐）。子は親と同じ段に置く
  const side = (u: string, v: string) => branch(u) && branch(v);

  // 始まり: 入る線の無い、開始らしい形の箱。無ければ入る線の無い箱、それも無ければ最初の箱。たどり着けない箱は、その後で別の始まりにする
  const starts = [
    ...items.filter(i => !ins.get(i.id) && i.start), ...items.filter(i => !ins.get(i.id) && !i.start), ...items,
  ].map(i => i.id);

  // 段: 戻る線（たどっている途中の箱へ戻る線）を除いて、一番長い道の長さ（横に置く線は長さ 0）。たどった順（後順の逆）で決める
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
  const parents = new Map(items.map(i => [i.id, [] as string[]]));
  for (const u of topo) for (const v of forward.get(u)!) parents.get(v)!.push(u);

  // 下へ続ける子: 分岐なら分岐でない子のうち最初のもの（分岐の子しか無ければ無し）、ほかは最初の子。
  // どの箱も、下へ続ける親は 1 つだけ（たどった順で先の親）。列と段を決める前に全部決める（ほかの箱の枝に先に取られないように）
  const downParent = new Map<string, string>();
  for (const u of topo) {
    const d = forward.get(u)!.find(v => !downParent.has(v) && !side(u, v) && !roots.includes(v));
    if (d) downParent.set(d, u);
  }

  // 列: 本筋（始まりから下へ続ける子をたどった並び）は 0。下へ続ける子は親と同じ列。
  // それ以外の子（枝や、横に置いた分岐）は、最初の親の列の外側の隣（本筋の箱からなら右が先、次は左…）
  const col = new Map<string, number>();
  const SIDES = [1, -1, 2, -2, 3, -3];
  const sideCount = new Map<string, number>();
  for (const v of topo) {
    const dp = downParent.get(v);
    if (dp !== undefined) { col.set(v, col.get(dp)!); continue; }
    const p = parents.get(v)!.find(u => col.has(u));
    if (p === undefined) { col.set(v, 0); continue; } // 始まり
    const c = col.get(p)!;
    const k = sideCount.get(p) ?? 0;
    sideCount.set(p, k + 1);
    col.set(v, c === 0 ? SIDES[Math.min(k, SIDES.length - 1)]! : c + Math.sign(c));
  }

  // 段: 親より下（下へ続ける親からは 1 段下）。横に置く分岐（分岐から分岐）は親と同じ段。
  // 合流する箱（下へ続ける親がいて、ほかの親からも線が入る）は、ほかの親と同じ段まで上げてよい（その線は横から入る。2026-10-12 ユーザー:
  // 「あ１」から「loop」へまっすぐ結び、図を縦に伸ばさないため）。ただし同じ列の親や、間の列に箱が挟まる親からは 1 段下（down に入れる）。
  // 合流する箱が分岐の形なら、どの親からも 1 段下（分岐へは上から入れる）
  const down = new Set<string>(); // 1 段下げる線（"親>子"）
  const layer = new Map(items.map(i => [i.id, 0]));
  const layering = () => {
    for (const v of topo) {
      let l = 0;
      for (const u of parents.get(v)!) {
        const lu = layer.get(u)!;
        // 分岐の形へは上から入れるので（graph.ts の autoAlign）、横からは入れない
        const across = !branch(v) && downParent.has(v) && downParent.get(v) !== u && col.get(u) !== col.get(v) && !down.has(`${u}>${v}`);
        l = Math.max(l, side(u, v) || across ? lu : lu + 1);
      }
      layer.set(v, l);
    }
    // 2 つ目からの始まりでたどった箱は、それまでの箱の下に続ける
    let below = 0;
    for (const seg of segments) {
      const top = Math.min(...seg.map(u => layer.get(u)!));
      for (const u of seg) layer.set(u, layer.get(u)! - top + below);
      below = Math.max(...seg.map(u => layer.get(u)!)) + 1;
    }
  };
  layering();
  // 横から入る線の間の列に、同じ段の箱が挟まっていたら、その線は 1 段下げて決め直す（変わらなくなるまで）
  for (let again = true, n = 0; again && n < items.length; n++) {
    again = false;
    for (const v of topo) {
      for (const u of parents.get(v)!) {
        if (side(u, v) || layer.get(u) !== layer.get(v) || down.has(`${u}>${v}`)) continue;
        const [lo, hi] = [Math.min(col.get(u)!, col.get(v)!), Math.max(col.get(u)!, col.get(v)!)];
        if (items.some(i => layer.get(i.id) === layer.get(v) && col.get(i.id)! > lo && col.get(i.id)! < hi)) { down.add(`${u}>${v}`); again = true; }
      }
    }
    if (again) layering();
  }

  // 横に置いた分岐（親と同じ段にいるもの）と、その親
  const dropOf = new Map<string, string>();
  for (const u of topo) {
    for (const v of forward.get(u)!) if (side(u, v) && layer.get(v) === layer.get(u) && !dropOf.has(v)) dropOf.set(v, u);
  }

  // 同じ段・同じ列に重なったら、外側へずらす
  const taken = new Set<string>();
  for (const u of topo) {
    let c = col.get(u)!;
    while (taken.has(`${layer.get(u)}:${c}`)) c += c >= 0 ? 1 : -1;
    col.set(u, c);
    taken.add(`${layer.get(u)}:${c}`);
  }

  // 位置。段は上から順に決める。横に置いた分岐は親の中心から sideDrop 下に置き、その下の端が段の下より出たら、次の段をその分だけ下げる
  const colW = Math.max(...items.map(i => i.w)) + o.gapX;
  const rows = Math.max(...items.map(i => layer.get(i.id)!)) + 1;
  const out = new Map<string, { x: number; y: number }>();
  const xOf = (i: FlowItem) => Math.round(o.centerX + col.get(i.id)! * colW - i.w / 2);
  let rowTop = o.top;
  for (let r = 0; r < rows; r++) {
    const inRow = items.filter(i => layer.get(i.id) === r);
    const flat = inRow.filter(i => !dropOf.has(i.id));
    const rowH = Math.max(0, ...flat.map(i => i.h));
    for (const i of flat) out.set(i.id, { x: xOf(i), y: Math.round(rowTop + (rowH - i.h) / 2) });
    // 横に置いた分岐は、親を置いてから（親も横に置いた分岐のことがあるので、たどった順に）
    let bottom = rowTop + rowH;
    for (const u of topo) {
      const p = dropOf.get(u);
      if (!p || layer.get(u) !== r) continue;
      const pp = out.get(p)!, parent = byId.get(p)!;
      const i = byId.get(u)!;
      const y = Math.round(pp.y + parent.h / 2 + o.sideDrop);
      out.set(u, { x: xOf(i), y });
      bottom = Math.max(bottom, y + i.h);
    }
    if (inRow.length) rowTop = bottom + o.gapY;
  }
  return out;
}
