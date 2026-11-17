// フローチャートの整列（純粋な関数）。形の大きさと線だけで動き、流れの向きが下へのときの位置を決める（右へは縦と横を入れ替えて使う）。
// 本筋（開始の形から、線をたどって下へ続ける子を選び続けた並び）の中心を 1 本の縦の線 centerX にそろえ、上から段に並べる。
// 分岐の枝は本筋の左右の列に置く（右が先）。段の高さはその段の一番高い形で決め、形は段の中で上下の真ん中にそろえる
// （横に並ぶ形どうしの線もまっすぐになる）。
// 分岐から分岐へ続くときは縦につながず、子の分岐を横（右が先）に置く。横に置いた分岐は親と同じ段で、親の中心から sideDrop だけ下げる
// （線は親の横の頂点から出て、子の分岐の上の頂点に入る）。
// 分岐の下へ続ける子は、分岐でない子のうち最初のもの（分岐の子しか無ければ、下へは続けない）。分岐でない形から分岐へは、下へ続ける。
//
//   alignFlow([{ id: "1", w: 120, h: 64, start: true, branch: false }, ...], [{ from: "1", to: "2" }],
//     { centerX: 400, top: 40, gapX: 60, gapY: 48, sideDrop: 24 })
//     → Map { "1" => { x, y }, ... }（左上の位置）
import type { Point } from "../../../plugin-api"

export interface FlowItem {
  id: string
  w: number
  h: number
  start: boolean // 開始らしい形（角丸・円）
  branch: boolean // 分岐の形（ひし形）
}
export interface FlowLink {
  from: string
  to: string
}
export interface FlowAlignOptions {
  centerX: number
  top: number
  gapX: number
  gapY: number
  sideDrop: number
}

// 本筋の箱から枝を置く列の順（右が先、次は左…）
const SIDES = [1, -1, 2, -2, 3, -3]

export function alignFlow(
  items: readonly FlowItem[],
  links: readonly FlowLink[],
  o: FlowAlignOptions,
): Map<string, Point> {
  const out = new Map<string, Point>()
  if (items.length === 0) return out
  const byId = new Map(items.map(i => [i.id, i]))
  const outs = new Map(items.map(i => [i.id, [] as string[]]))
  const ins = new Map(items.map(i => [i.id, 0]))
  for (const l of links) {
    if (l.from === l.to || !byId.has(l.from) || !byId.has(l.to)) continue
    outs.get(l.from)?.push(l.to)
    ins.set(l.to, (ins.get(l.to) ?? 0) + 1)
  }
  const branch = (id: string) => byId.get(id)?.branch ?? false
  // 横に置く線（分岐から分岐）。子は親と同じ段に置く
  const side = (u: string, v: string) => branch(u) && branch(v)

  // 始まり: 入る線の無い、開始らしい形。無ければ入る線の無い形、それも無ければ最初の形。たどり着けない形は、その後で別の始まりにする
  const starts = [
    ...items.filter(i => !ins.get(i.id) && i.start),
    ...items.filter(i => !ins.get(i.id) && !i.start),
    ...items,
  ].map(i => i.id)

  // 段: 戻る線（たどっている途中の形へ戻る線）を除いて、一番長い道の長さ（横に置く線は長さ 0）。たどった順（後順の逆）で決める
  const state = new Map<string, "on" | "done">()
  const forward = new Map(items.map(i => [i.id, [] as string[]]))
  const post: string[] = []
  const visit = (u: string) => {
    state.set(u, "on")
    for (const v of outs.get(u) ?? []) {
      if (state.get(v) === "on") continue // 戻る線
      forward.get(u)?.push(v)
      if (!state.has(v)) visit(v)
    }
    state.set(u, "done")
    post.push(u)
  }
  const roots: string[] = []
  const segments: string[][] = [] // 始まりごとに、新しくたどった形
  for (const r of starts) {
    if (state.has(r)) continue
    const before = post.length
    roots.push(r)
    visit(r)
    segments.push(post.slice(before))
  }
  const topo = [...post].reverse()
  const parents = new Map(items.map(i => [i.id, [] as string[]]))
  for (const u of topo) for (const v of forward.get(u) ?? []) parents.get(v)?.push(u)

  // 下へ続ける子: 分岐なら分岐でない子のうち最初のもの（分岐の子しか無ければ無し）、ほかは最初の子。
  // どの形も、下へ続ける親は 1 つだけ（たどった順で先の親）。列と段を決める前に全部決める（ほかの形の枝に先に取られないように）
  const downParent = new Map<string, string>()
  for (const u of topo) {
    const d = (forward.get(u) ?? []).find(v => !downParent.has(v) && !side(u, v) && !roots.includes(v))
    if (d) downParent.set(d, u)
  }

  // 列: 本筋（始まりから下へ続ける子をたどった並び）は 0。下へ続ける子は親と同じ列。
  // それ以外の子（枝や、横に置いた分岐）は、最初の親の列の外側の隣（本筋の形からなら右が先、次は左…）
  const col = new Map<string, number>()
  const sideCount = new Map<string, number>()
  const colOf = (id: string) => col.get(id) ?? 0
  for (const v of topo) {
    const dp = downParent.get(v)
    if (dp !== undefined) {
      col.set(v, colOf(dp))
      continue
    }
    const p = parents.get(v)?.find(u => col.has(u))
    if (p === undefined) {
      col.set(v, 0) // 始まり
      continue
    }
    const c = colOf(p)
    const k = sideCount.get(p) ?? 0
    sideCount.set(p, k + 1)
    col.set(v, c === 0 ? (SIDES[Math.min(k, SIDES.length - 1)] as number) : c + Math.sign(c))
  }

  // 段: 親より下（下へ続ける親からは 1 段下）。横に置く分岐（分岐から分岐）は親と同じ段。
  // 合流する形（下へ続ける親がいて、ほかの親からも線が入る）は、ほかの親と同じ段まで上げてよい（その線は横から入る。図を縦に伸ばさないため）。
  // ただし同じ列の親や、間の列に形が挟まる親からは 1 段下（down に入れる）。合流する形が分岐なら、どの親からも 1 段下（分岐へは上から入れる）
  const down = new Set<string>() // 1 段下げる線（"親>子"）
  const layer = new Map(items.map(i => [i.id, 0]))
  const layerOf = (id: string) => layer.get(id) ?? 0
  const layering = () => {
    for (const v of topo) {
      let l = 0
      for (const u of parents.get(v) ?? []) {
        const lu = layerOf(u)
        const across =
          !branch(v) && downParent.has(v) && downParent.get(v) !== u && colOf(u) !== colOf(v) && !down.has(`${u}>${v}`)
        l = Math.max(l, side(u, v) || across ? lu : lu + 1)
      }
      layer.set(v, l)
    }
    // 2 つ目からの始まりでたどった形は、それまでの形の下に続ける
    let below = 0
    for (const seg of segments) {
      const top = Math.min(...seg.map(layerOf))
      for (const u of seg) layer.set(u, layerOf(u) - top + below)
      below = Math.max(...seg.map(layerOf)) + 1
    }
  }
  layering()
  // 横から入る線の間の列に、同じ段の形が挟まっていたら、その線は 1 段下げて決め直す（変わらなくなるまで）
  for (let again = true, n = 0; again && n < items.length; n++) {
    again = false
    for (const v of topo) {
      for (const u of parents.get(v) ?? []) {
        if (side(u, v) || layerOf(u) !== layerOf(v) || down.has(`${u}>${v}`)) continue
        const lo = Math.min(colOf(u), colOf(v))
        const hi = Math.max(colOf(u), colOf(v))
        if (items.some(i => layerOf(i.id) === layerOf(v) && colOf(i.id) > lo && colOf(i.id) < hi)) {
          down.add(`${u}>${v}`)
          again = true
        }
      }
    }
    if (again) layering()
  }

  // 横に置いた分岐（親と同じ段にいるもの）と、その親
  const dropOf = new Map<string, string>()
  for (const u of topo) {
    for (const v of forward.get(u) ?? [])
      if (side(u, v) && layerOf(v) === layerOf(u) && !dropOf.has(v)) dropOf.set(v, u)
  }

  // 同じ段・同じ列に重なったら、外側へずらす
  const taken = new Set<string>()
  for (const u of topo) {
    let c = colOf(u)
    while (taken.has(`${layerOf(u)}:${c}`)) c += c >= 0 ? 1 : -1
    col.set(u, c)
    taken.add(`${layerOf(u)}:${c}`)
  }

  // 位置。段は上から順に決める。横に置いた分岐は親の中心から sideDrop 下に置き、その下の端が段の下より出たら、次の段をその分だけ下げる
  const colW = Math.max(...items.map(i => i.w)) + o.gapX
  const rows = Math.max(...items.map(i => layerOf(i.id))) + 1
  const xOf = (i: FlowItem) => Math.round(o.centerX + colOf(i.id) * colW - i.w / 2)
  let rowTop = o.top
  for (let r = 0; r < rows; r++) {
    const inRow = items.filter(i => layerOf(i.id) === r)
    const flat = inRow.filter(i => !dropOf.has(i.id))
    const rowH = Math.max(0, ...flat.map(i => i.h))
    for (const i of flat) out.set(i.id, { x: xOf(i), y: Math.round(rowTop + (rowH - i.h) / 2) })
    // 横に置いた分岐は、親を置いてから（親も横に置いた分岐のことがあるので、たどった順に）
    let bottom = rowTop + rowH
    for (const u of topo) {
      const p = dropOf.get(u)
      const at = p && out.get(p)
      const parent = p && byId.get(p)
      const i = byId.get(u)
      if (!at || !parent || !i || layerOf(u) !== r) continue
      const y = Math.round(at.y + parent.h / 2 + o.sideDrop)
      out.set(u, { x: xOf(i), y })
      bottom = Math.max(bottom, y + i.h)
    }
    if (inRow.length) rowTop = bottom + o.gapY
  }
  return out
}
