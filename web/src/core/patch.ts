// データの置き直し（画面の履歴の段を戻す・やり直す）: 2 つの値 from・to の違う所だけを to にする値（Patch）を作り、今の値の上で行う。
// オブジェクトはフィールドごと、どの要素も id を持つ並びは id ごと（並びの順も）、改行を含む文字列は行ごとにたどる。
// 今の値で、Patch が変えた所のほかが変わっていれば残し、重なれば to の値で上書きする。タイプごとの形は見ない
import { sameData } from "./same"

type Fields = Readonly<Record<string, unknown>>
type Keyed = { id: string } & Fields

// 置き直す値: set はその値にする（absent ならフィールドを外す）。fields はフィールドごと、list は id ごと（index は to の並びでの位置、
// order は並びに今ある物のうち挙げた id の物の場所に挙げた順に並べ直す）、text は from から to への行の違いを今の文字列に当てる（行ごとの 3 方向のマージ）
export type Patch =
  | { set: unknown }
  | { absent: true }
  | { fields: Readonly<Record<string, Patch>> }
  | { list: readonly ListPatch[]; order?: readonly string[] }
  | { text: { from: string; to: string } }
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

// 並び from を並び to の順に直す id の順（両方にある物の相対順が同じなら無し）
export function orderPatch(from: readonly { id: string }[], to: readonly { id: string }[]): string[] | undefined {
  const inFrom = new Set(from.map(x => x.id))
  const inTo = new Set(to.map(x => x.id))
  const a = from.filter(x => inTo.has(x.id)).map(x => x.id)
  const b = to.filter(x => inFrom.has(x.id)).map(x => x.id)
  return a.some((id, i) => id !== b[i]) ? b : undefined
}

// 値 from を to にする Patch（同じなら undefined）
export function patchOf(from: unknown, to: unknown): Patch | undefined {
  if (sameData(from, to)) return undefined
  if (to === undefined) return { absent: true }
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
    for (const id of was.keys()) if (!now.has(id)) list.push({ id, index: -1, patch: { absent: true } })
    for (const [id, { x, i }] of now) {
      const p = was.has(id) ? patchOf(was.get(id), x) : { set: x }
      if (p) list.push({ id, index: i, patch: p })
    }
    const order = orderPatch(from, to)
    return { list, ...(order ? { order } : {}) }
  }
  if (typeof from === "string" && typeof to === "string" && (from.includes("\n") || to.includes("\n")))
    return { text: { from, to } }
  return { set: to }
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
    const items = p.list.reduce((list: Keyed[], q) => putIn(list, q), [...(now as Keyed[])])
    return p.order ? reorder(items, p.order) : items
  }
  return typeof now === "string"
    ? mergeText(p.text.from.split("\n"), p.text.to.split("\n"), now.split("\n")).join("\n")
    : now
}

// 並び list に要素の Patch を行う: absent なら外し、今あればたどり、無ければ（set のときだけ）to の並びの位置に足す
function putIn(list: Keyed[], q: ListPatch): Keyed[] {
  const at = list.findIndex(x => x.id === q.id)
  if ("absent" in q.patch) return at < 0 ? list : list.filter(x => x.id !== q.id)
  if (at >= 0) return list.map(x => (x.id === q.id ? (applyPatch(x, q.patch) as Keyed) : x))
  if (!("set" in q.patch)) return list
  return [...list.slice(0, q.index), q.patch.set as Keyed, ...list.slice(q.index)]
}

// 並び list の、order に挙げた id の物（list に無い id は飛ばす）の場所に、その物を order の順に並べ直す。ほかの物は動かさない
function reorder<T extends { id: string }>(list: readonly T[], order: readonly string[]): T[] {
  const byId = new Map(list.map(x => [x.id, x]))
  const moved = order.flatMap(id => byId.get(id) ?? [])
  const slots = new Set(moved.map(x => x.id))
  let at = 0
  return list.map(x => (slots.has(x.id) ? (moved[at++] as T) : x))
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

// Patch first が変えた所を、そのあとの Patch then（first の後の値から、さらに変えた物。間にほかの変更があってもよい）が上書きしたか。
// フィールドと id の並びは同じ所を変えたら上書き（並びの順だけの違いは見ない）。行の違いは、first が書いた行のかたまりが then の後の文字列に残っていなければ上書き
export function overlaps(first: Patch, then: Patch): boolean {
  if ("fields" in first && "fields" in then)
    return Object.entries(first.fields).some(([k, p]) => {
      const q = then.fields[k]
      return q !== undefined && overlaps(p, q)
    })
  if ("list" in first && "list" in then) {
    const later = new Map(then.list.map(q => [q.id, q.patch]))
    return first.list.some(p => {
      const q = later.get(p.id)
      return q !== undefined && overlaps(p.patch, q)
    })
  }
  if ("text" in first && "text" in then) {
    const now = `\n${then.text.to}\n`
    return hunksOf(first.text.from.split("\n"), first.text.to.split("\n")).some(
      h => h.lines.length > 0 && !now.includes(`\n${h.lines.join("\n")}\n`),
    )
  }
  return true
}

// Patch が書いた所と値の並び（AI などに見せる形）: at はフィールドの名前と id の並びの id をたどった道（/ で区切る）。
// value は入れた値、removed は外した物、lines は足した・書き換えた行（行ごとの違いのとき）
export type Written = { at: string } & ({ value: unknown } | { removed: true } | { lines: readonly string[] })
export function writtenBy(p: Patch, at = ""): Written[] {
  if ("set" in p) return [{ at, value: p.set }]
  if ("absent" in p) return [{ at, removed: true }]
  if ("fields" in p) return Object.entries(p.fields).flatMap(([k, q]) => writtenBy(q, at ? `${at}/${k}` : k))
  if ("list" in p) return p.list.flatMap(q => writtenBy(q.patch, `${at}/${q.id}`))
  const lines = hunksOf(p.text.from.split("\n"), p.text.to.split("\n")).flatMap(h => h.lines)
  return [{ at, lines }]
}
