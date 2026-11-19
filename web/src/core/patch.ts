// データの置き直し（画面の履歴の段を戻す・やり直す）: 2 つの値 from・to の違う所だけを to にする値（Patch）を作り、今の値の上で行う。
// オブジェクトはフィールドごと、どの要素も id を持つ並びは id ごと（並びの順も）、改行を含む文字列は行ごとにたどる。
// Patch は所ごとに反対側（from）の値も持つ。toPutBack が、今の値でそれを確かめ、置き直す所だけの Patch にする（反対側のままの所だけを置き直し、
// どちらの値でもない所が 1 つでも在れば、ぶつかりとして断る）。applyPatch は確かめずに行う（Patch が変えた所のほかで変わった所は残し、重なれば to で上書きする）
import { sameData } from "./same"

type Fields = Readonly<Record<string, unknown>>
type Keyed = { id: string } & Fields

// 置き直す値: set はその値にする（absent ならフィールドを外す）。was は反対側の値（set で was が無ければ、反対側では無かった）。
// fields はフィールドごと、list は id ごと（index は to の並びでの位置。order は from と to の両方に在る物の to での順、was はその from での順、
// moved はそのうち from から to で動かした物。今の並びで、moved の物だけを置き直す: reorder）、text は from から to への行の違いを今の文字列に当てる
// （行ごとの 3 方向のマージ）
export type Patch =
  | { set: unknown; was?: unknown }
  | { absent: true; was: unknown }
  | { fields: Readonly<Record<string, Patch>> }
  | { list: readonly ListPatch[] }
  | ({ list: readonly ListPatch[] } & ListOrder)
  | { text: { from: string; to: string } }
export interface ListOrder {
  order: readonly string[]
  was: readonly string[]
  moved: readonly string[]
}
export interface ListPatch {
  id: string
  index: number
  patch: Patch
}
// 行の違い 1 つ: from の start 行目から end 行目の前までを、lines に替える
interface TextHunk {
  start: number
  end: number
  lines: readonly string[]
}

const isFields = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v)

// どの要素も id（文字列）を持ち、id が重ならない並び
function isKeyed(v: unknown): v is readonly Keyed[] {
  if (!Array.isArray(v)) return false
  const ids = new Set<string>()
  for (const x of v) {
    if (!isFields(x) || typeof x.id !== "string" || ids.has(x.id)) return false
    ids.add(x.id)
  }
  return true
}

// 並び from を並び to の順に直す値: 両方にある物の to での順 order と from での順 was、そのうち動かした物 moved（両方にある物の、from と to の
// 共通の部分列が最長になる組に入らない物。相対順が同じなら無し）
function orderPatch(from: readonly { id: string }[], to: readonly { id: string }[]): ListOrder | undefined {
  const inFrom = new Set(from.map(x => x.id))
  const inTo = new Set(to.map(x => x.id))
  const a = from.filter(x => inTo.has(x.id)).map(x => x.id)
  const b = to.filter(x => inFrom.has(x.id)).map(x => x.id)
  if (a.every((id, i) => id === b[i])) return undefined
  const kept = new Set([...matchLines(a, b).values()].map(j => b[j]))
  return { order: b, was: a, moved: b.filter(id => !kept.has(id)) }
}

// 値 from を to にする Patch（同じなら undefined）
export function patchOf(from: unknown, to: unknown): Patch | undefined {
  if (sameData(from, to)) return undefined
  if (to === undefined) return { absent: true, was: from }
  if (isFields(from) && isFields(to)) {
    const fields: Record<string, Patch> = {}
    for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
      const p = patchOf(from[k], to[k])
      if (p) fields[k] = p
    }
    return { fields }
  }
  if (isKeyed(from) && isKeyed(to) && (from.length > 0 || to.length > 0)) {
    const was = new Map(from.map(x => [x.id, x]))
    const now = new Map(to.map((x, i) => [x.id, { x, i }]))
    const list: ListPatch[] = []
    for (const [id, x] of was) if (!now.has(id)) list.push({ id, index: -1, patch: { absent: true, was: x } })
    for (const [id, { x, i }] of now) {
      const p = was.has(id) ? patchOf(was.get(id), x) : { set: x }
      if (p) list.push({ id, index: i, patch: p })
    }
    const order = orderPatch(from, to)
    return { list, ...(order ?? {}) }
  }
  if (typeof from === "string" && typeof to === "string" && (from.includes("\n") || to.includes("\n")))
    return { text: { from, to } }
  return from === undefined ? { set: to } : { set: to, was: from }
}

// 今の値 now に Patch を行う（absent なら undefined を返す。たどる先の形が違えば、その所は飛ばす）
export function applyPatch(now: unknown, p: Patch): unknown {
  if ("set" in p) return p.set
  if ("absent" in p) return undefined
  if ("fields" in p) {
    if (!isFields(now)) return now
    const next: Record<string, unknown> = { ...now }
    for (const [k, q] of Object.entries(p.fields)) {
      const v = applyPatch(now[k], q)
      if (v === undefined) delete next[k]
      else next[k] = v
    }
    return next
  }
  if ("list" in p) {
    if (!Array.isArray(now)) return now
    // 外す・たどる → 動かした物を置き直す → 無い物を足す（足す位置 index は to の並びでの位置なので、並べ直した後に入れる）
    const adds = (q: ListPatch) => "set" in q.patch
    const kept = p.list.filter(q => !adds(q)).reduce((list: Keyed[], q) => putIn(list, q), [...(now as Keyed[])])
    const ordered = "order" in p ? reorder(kept, p.order, p.moved) : kept
    return p.list.filter(adds).reduce((list: Keyed[], q) => putIn(list, q), ordered)
  }
  return typeof now === "string"
    ? mergeText(p.text.from.split("\n"), p.text.to.split("\n"), now.split("\n")).join("\n")
    : now
}

// 置き直しがぶつかったこと（toPutBack が返す）: 今の値に、置き直す側でも反対側でもない所が在る
export const CLASH = "clash"

// 今の値 now に Patch p を置き直すときの、置き直す所だけの Patch。所ごとに今の値を確かめ、反対側の値のままの所だけを入れ、もう置き直す側の値の所は飛ばす
// （全部飛ばせば undefined）。どちらの値でもない所が 1 つでも在れば CLASH。並びの順は、動かした物（moved）ごとに、反対側の順で前後にある、
// 今の並びに在る動かしていない物との順が、今も同じかで確かめる（置き直す側の順と同じなら飛ばす）。行の違いは、違いの所の反対側の行が、今も続けて並んでいるか
export function toPutBack(now: unknown, p: Patch): Patch | undefined | typeof CLASH {
  if ("set" in p) {
    if (sameData(now, p.set)) return undefined
    return ("was" in p ? sameData(now, p.was) : now === undefined) ? p : CLASH
  }
  if ("absent" in p) {
    if (now === undefined) return undefined
    return sameData(now, p.was) ? p : CLASH
  }
  if ("fields" in p) {
    if (!isFields(now)) return CLASH
    const fields: Record<string, Patch> = {}
    for (const [k, q] of Object.entries(p.fields)) {
      const r = toPutBack(now[k], q)
      if (r === CLASH) return CLASH
      if (r) fields[k] = r
    }
    return Object.keys(fields).length > 0 ? { fields } : undefined
  }
  if ("list" in p) {
    if (!isKeyed(now)) return CLASH
    const list: ListPatch[] = []
    for (const q of p.list) {
      const r = toPutBack(
        now.find(x => x.id === q.id),
        q.patch,
      )
      if (r === CLASH) return CLASH
      if (r) list.push({ ...q, patch: r })
    }
    const moved = "order" in p ? movedBack(now, p) : []
    if (moved === CLASH) return CLASH
    if (list.length === 0 && moved.length === 0) return undefined
    return "order" in p && moved.length > 0 ? { list, order: p.order, was: p.was, moved } : { list }
  }
  if (typeof now !== "string") return CLASH
  if (now === p.text.to) return undefined
  if (now === p.text.from) return p
  const from = p.text.from.split("\n")
  const pairs = matchLines(from, now.split("\n"))
  const kept = hunksOf(from, p.text.to.split("\n")).every(h => {
    const lines = Array.from({ length: h.end - h.start }, (_, k) => pairs.get(h.start + k))
    return lines.every((n, k) => n !== undefined && n === (lines[0] as number) + k)
  })
  return kept ? p : CLASH
}

// 並びの Patch p が動かした物のうち、今の並び now で反対側の順のままの物（置き直す物）。どれかが今の並びに無いか、どちらの順でもなければ CLASH
function movedBack(now: readonly Keyed[], p: ListOrder): string[] | typeof CLASH {
  const at = new Map(now.map((x, i) => [x.id, i]))
  const moving = new Set(p.moved)
  // 順 order で、物 id の前後にある、今の並びに在る動かしていない物との順を、今の並びも守っているか
  const keeps = (order: readonly string[], id: string): boolean => {
    const i = order.indexOf(id)
    const anchor = (x: string) => !moving.has(x) && at.has(x)
    const before = order.slice(0, i).reverse().find(anchor)
    const after = order.slice(i + 1).find(anchor)
    const here = at.get(id) as number
    return (
      (before === undefined || (at.get(before) as number) < here) &&
      (after === undefined || here < (at.get(after) as number))
    )
  }
  const back: string[] = []
  for (const id of p.moved) {
    if (!at.has(id)) return CLASH
    if (keeps(p.was, id)) back.push(id)
    else if (!keeps(p.order, id)) return CLASH
  }
  return back
}

// 並び list に要素の Patch を行う: absent なら外し、今あればたどり、無ければ（set のときだけ）to の並びの位置に足す
function putIn(list: Keyed[], q: ListPatch): Keyed[] {
  const at = list.findIndex(x => x.id === q.id)
  if ("absent" in q.patch) return at < 0 ? list : list.filter(x => x.id !== q.id)
  if (at >= 0) return list.map(x => (x.id === q.id ? (applyPatch(x, q.patch) as Keyed) : x))
  if (!("set" in q.patch)) return list
  return [...list.slice(0, q.index), q.patch.set as Keyed, ...list.slice(q.index)]
}

// 並び list の、moved に挙げた物だけを置き直す（ほかの物は、今の順のまま動かさない）。決まり: 動かした物は、order（to の順）で前と後にある、
// 動かしていない物（と、先に置き直した動かした物）との順を、今の並びでも守る。order の順に 1 つずつ、前にあるべき物のうち今の並びで一番後ろの物の
// すぐ後ろに置く。前にあるべき物が今の並びに無ければ、後ろにあるべき物のうち一番前の物のすぐ前に、どちらも無ければ元の場所に置く。
// 前と後の決まりがぶつかる（ほかの変更で、前にあるべき物が後ろにあるべき物より後ろに来ている）ときは、前にあるべき物との順を取る
function reorder<T extends { id: string }>(
  list: readonly T[],
  order: readonly string[],
  moved: readonly string[],
): T[] {
  const moving = new Set(moved)
  const byId = new Map(list.map(x => [x.id, x]))
  const out = list.filter(x => !moving.has(x.id))
  const anchors = new Set(order.filter(id => !moving.has(id)))
  order.forEach((id, i) => {
    const item = byId.get(id)
    if (!moving.has(id) || !item) return
    const before = new Set(order.slice(0, i).filter(x => anchors.has(x)))
    const after = new Set(order.slice(i + 1).filter(x => anchors.has(x)))
    const last = out.reduce((at, x, j) => (before.has(x.id) ? j : at), -1)
    const next = out.findIndex(x => after.has(x.id))
    const at = last >= 0 ? last + 1 : next >= 0 ? next : Math.min(list.indexOf(item), out.length)
    out.splice(at, 0, item)
    anchors.add(id)
  })
  return out
}

// 2 つの行の並びの、同じ行の組（a の行番号 → b の行番号。共通の部分列が最長になる組。前と後ろの同じ行は先に除く）
function matchLines(a: readonly string[], b: readonly string[]): Map<number, number> {
  const pairs = new Map<number, number>()
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) pairs.set(head, head++)
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    pairs.set(a.length - 1 - tail, b.length - 1 - tail)
    tail++
  }
  const n = a.length - head - tail
  const m = b.length - head - tail
  // 真ん中は表で求める（len の i * w + j は、a の i 行目・b の j 行目から後ろの、共通の部分列の長さ）
  const w = m + 1
  const len = new Uint32Array((n + 1) * w)
  const at = (i: number, j: number) => len[i * w + j] as number
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      len[i * w + j] = a[head + i] === b[head + j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[head + i] === b[head + j]) pairs.set(head + i++, head + j++)
    else if (at(i + 1, j) >= at(i, j + 1)) i++
    else j++
  }
  return pairs
}

// 行の並び from を to にする行の違い（from の行番号の順）
function hunksOf(from: readonly string[], to: readonly string[]): TextHunk[] {
  const pairs = [...matchLines(from, to)].sort(([x], [y]) => x - y)
  const hunks: TextHunk[] = []
  let i = 0
  let j = 0
  for (const [a, b] of [...pairs, [from.length, to.length] as const]) {
    if (a > i || b > j) hunks.push({ start: i, end: a, lines: to.slice(j, b) })
    i = a + 1
    j = b + 1
  }
  return hunks
}

// 今の行の並び now に、from から to への行の違いを当てる。違いの所の from の行が now でもそのまま並んでいればそこを替え、ほかで変わっていれば、
// 前後の変わっていない行（from と now で対応の取れる行）に挟まれた所を丸ごと替える（重なった所は to で上書き）
function mergeText(from: readonly string[], to: readonly string[], now: readonly string[]): string[] {
  const hunks = hunksOf(from, to)
  const pairs = matchLines(from, now)
  const out: string[] = []
  let at = 0 // now の、まだ出していない最初の行
  for (const h of hunks) {
    let before = -1 // 違いの前の、対応の取れた最後の行（now の側）
    for (let k = h.start - 1; k >= 0; k--)
      if (pairs.has(k)) {
        before = pairs.get(k) as number
        break
      }
    let after = now.length // 違いの後の、対応の取れた最初の行（now の側）
    for (let k = h.end; k < from.length; k++)
      if (pairs.has(k)) {
        after = pairs.get(k) as number
        break
      }
    // 違いの from の行が now でも続けて並んでいれば、その行だけを替える（行を足すだけの違いは、前の行のすぐ後ろに足す）
    const lines = Array.from({ length: h.end - h.start }, (_, k) => pairs.get(h.start + k))
    const kept = lines.every((n, k) => n !== undefined && n === (lines[0] as number) + k)
    const lo = Math.max(at, kept && lines.length > 0 ? (lines[0] as number) : before + 1)
    const hi = kept ? lo + lines.length : after
    out.push(...now.slice(at, lo), ...h.lines)
    at = Math.max(lo, hi)
  }
  out.push(...now.slice(at))
  return out
}

// Patch made（ほかの物が書いた所）が書いた値のうち、ある変更の前の値 before にはまだあり、後の値 after では無くなった所（書いた所と値の並び。無ければ空）。
// フィールドと id の並びは、書いた値が前にあって後に無い所。行の違いは、書いた行が前の文字列にあって後の文字列に無い（消した行は、前に無くて後にある）所
export function undoneIn(made: Patch, before: unknown, after: unknown, at = ""): Written[] {
  if ("set" in made) return sameData(before, made.set) && !sameData(after, made.set) ? [{ at, value: made.set }] : []
  if ("absent" in made) return before === undefined && after !== undefined ? [{ at, removed: true }] : []
  if ("fields" in made) {
    if (!isFields(before)) return []
    const later = isFields(after) ? after : {}
    return Object.entries(made.fields).flatMap(([k, q]) => undoneIn(q, before[k], later[k], at ? `${at}/${k}` : k))
  }
  if ("list" in made) {
    if (!Array.isArray(before)) return []
    const find = (list: unknown, id: string) =>
      Array.isArray(list) ? (list as Keyed[]).find(x => isFields(x) && x.id === id) : undefined
    return made.list.flatMap(q => undoneIn(q.patch, find(before, q.id), find(after, q.id), `${at}/${q.id}`))
  }
  if (typeof before !== "string") return []
  const from = made.text.from.split("\n")
  const wrote = made.text.to.split("\n")
  const now = typeof after === "string" ? after.split("\n") : []
  const { removedLines } = linesOf(from, wrote)
  // 書いた行（made の後の文字列の行）を前の文字列に重ね、後の文字列に残ったかを見る（同じ字の行がほかにあっても取り違えない）
  const was = before.split("\n")
  const toBefore = matchLines(wrote, was)
  const kept = matchLines(was, now)
  const ours = new Set(matchLines(from, wrote).values())
  const lost = wrote.filter((_, i) => {
    const j = toBefore.get(i)
    return !ours.has(i) && j !== undefined && !kept.has(j)
  })
  // 消した行は、後の文字列に新しく足された行に、同じ字の物があれば戻された
  const back = new Set(kept.values())
  const added = new Set(now.filter((_, j) => !back.has(j)))
  const returned = removedLines.filter(l => added.has(l))
  return lost.length > 0 || returned.length > 0
    ? [{ at, lines: lost, ...(returned.length > 0 ? { removedLines: returned } : {}) }]
    : []
}

// 書いた所と値の並び（AI などに見せる形。undoneIn が返す）: at はフィールドの名前と id の並びの id をたどった道（/ で区切る）。
// value は入れた値、removed は外した物、lines は足した・書き換えた行と removedLines は消した行（行ごとの違いのとき）
export type Written = { at: string } & (
  | { value: unknown }
  | { removed: true }
  | { lines: readonly string[]; removedLines?: readonly string[] }
)

// 行の並び from を to にした違いの、足した・書き換えた行と、消した行
function linesOf(from: readonly string[], to: readonly string[]): { lines: string[]; removedLines: string[] } {
  const hunks = hunksOf(from, to)
  return {
    lines: hunks.flatMap(h => h.lines),
    removedLines: hunks.flatMap(h => from.slice(h.start, h.end)),
  }
}
