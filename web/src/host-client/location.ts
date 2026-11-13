// ブラウザの URL と画面の場所（core/address.ts）の行き来（ルーターは入れない。開いている場所は store が持ち、URL はそれを映す）。
// 開いたときは URL の場所を当てはめ（store の locate）、見ているものが変わったら URL に書く。移動（ステージの数か、ブック・ページが変わった。積むと宣言した画面の状態の値が変わった）
// ならブラウザの履歴に積み（pushState）、倍率・ずらす量・カレント・境目だけなら、しばらく待ってまとめて書き換える（replaceState）。同じ同期の処理の中の
// 変わりは、終わってから 1 つにまとめて書く（分割してブックとページを開いても、ブラウザの履歴に積むのは 1 つ）。ブラウザの戻る・進む（popstate）は、その URL の場所を当てはめる。
// URL の形: 値 1 つ（sc）に、場所を短い名前の JSON で書く（searchOf）。前の形（b0・p0・v0・s0…、c・r・w・f）は読むだけで、書かない。
// URL が無ければ、開いた直後はステージを並べないスクリーン（コントロールセンター）を前に出す。プラグイン状態の中身は読まない（形を確かめるのは store の locate）
import { type Address, moved, recentStagesIn, type ScreenPlace, type StagePlace } from "../core/address"
import type { MatomezuInstance } from "../store/store"

// URL とのやり取り（テストでは差し替える）
export interface Place {
  search(): string // 今の URL の ? から後ろ
  push(search: string): void // ブラウザの履歴に積む
  replace(search: string): void // 今のブラウザの履歴を書き換える
  onPop(listener: () => void): () => void // 戻る・進むで URL が変わったら呼ぶ。止める関数を返す
  later(run: () => void): () => void // しばらくしてから run を呼ぶ（書き換えをまとめる）。取り消す関数を返す
}

// 倍率・ずらす量などの書き換えをまとめる間（ms。紙をずらしている間に何度も書き換えない）
export const REPLACE_AFTER = 300

export const browserPlace: Place = {
  search: () => window.location.search,
  push: search => window.history.pushState(null, "", search),
  replace: search => window.history.replaceState(null, "", search),
  onPop: listener => {
    window.addEventListener("popstate", listener)
    return () => window.removeEventListener("popstate", listener)
  },
  later: run => {
    const timer = setTimeout(run, REPLACE_AFTER)
    return () => clearTimeout(timer)
  },
}

const round = (n: number) => Math.round(n * 1000) / 1000

// URL の値 1 つに書く形（短い名前の JSON）: s はスクリーンの並び（i は id、d は定義の id、p は渡された値、t はスクリーンの範囲のプラグイン状態、
// g はステージを並べるスクリーンの中）、o は前に出した順、w は窓の範囲のプラグイン状態。g の l はステージの並び（b はブックの id、p はページの id、
// v は倍率・横・縦、s はステージの範囲のプラグイン状態）、c はカレントの番号、r は境目の割合。空の物は書かない
interface Written {
  s: { i: string; d: string; p?: unknown; t?: Record<string, unknown>; g?: WrittenStages }[]
  o: string[]
  w?: Record<string, unknown>
}
interface WrittenStages {
  l: { b: string | null; p?: string; v: [number, number, number]; s?: Record<string, unknown> }[]
  c: number
  r: number
}

const some = (o: Readonly<Record<string, unknown>>) => Object.keys(o).length > 0
const emptyProps = (p: unknown) =>
  typeof p === "object" && p !== null && !Array.isArray(p) && Object.keys(p).length === 0

// 場所を URL の ? から後ろにする
export function searchOf(address: Address): string {
  const written: Written = {
    s: address.screens.map(s => ({
      i: s.id,
      d: s.def,
      ...(emptyProps(s.props) ? {} : { p: s.props }),
      ...(some(s.states) ? { t: { ...s.states } } : {}),
      ...(s.stages
        ? {
            g: {
              l: s.stages.places.map(p => ({
                b: p.book,
                ...(p.page !== null ? { p: p.page } : {}),
                v: [round(p.zoom), round(p.pan.x), round(p.pan.y)] as [number, number, number],
                ...(some(p.states) ? { s: { ...p.states } } : {}),
              })),
              c: s.stages.current,
              r: round(s.stages.share),
            },
          }
        : {}),
    })),
    o: [...address.order],
    ...(some(address.window) ? { w: { ...address.window } } : {}),
  }
  const q = new URLSearchParams()
  q.set("sc", JSON.stringify(written))
  return `?${q.toString()}`
}

// 前の形の URL から読んだ場所: 前に出す物の種類（ステージを並べるスクリーンか、そうでないスクリーンか）と、ブックスクリーンのステージの並び
export interface FormerAddress {
  former: true
  front: "control-center" | "book-screen"
  stages: readonly StagePlace[]
  current: number
  share: number
  window: Readonly<Record<string, unknown>>
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

// URL の ? から後ろを場所にする（matomezu の場所でなければ null）。前の形の URL（b0・p0・v0・s0…、c・r・w・f）も読む（FormerAddress。fromFormer で今の形に直す）
export function parseSearch(search: string): Address | FormerAddress | null {
  const q = new URLSearchParams(search)
  const sc = q.get("sc")
  if (sc !== null) return writtenAddress(sc)
  return formerAddress(q)
}

// sc の値（JSON）を場所にする（形に合わなければ null。合わないスクリーンとステージは落とす）
function writtenAddress(text: string): Address | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(value) || !Array.isArray(value.s)) return null
  const screens: ScreenPlace[] = value.s.flatMap((s: unknown): ScreenPlace[] => {
    if (!isObject(s) || typeof s.i !== "string" || typeof s.d !== "string") return []
    const g = isObject(s.g) && Array.isArray(s.g.l) ? s.g : null
    const places: StagePlace[] = (g ? (g.l as unknown[]) : []).flatMap((p: unknown): StagePlace[] => {
      if (!isObject(p)) return []
      const v = Array.isArray(p.v) ? p.v : []
      return [
        {
          book: typeof p.b === "string" && p.b !== "" ? p.b : null,
          page: typeof p.p === "string" ? p.p : null,
          zoom: num(v[0], 1),
          pan: { x: num(v[1], 0), y: num(v[2], 0) },
          states: isObject(p.s) ? p.s : {},
        },
      ]
    })
    return [
      {
        id: s.i,
        def: s.d,
        props: s.p ?? {},
        states: isObject(s.t) ? s.t : {},
        ...(g ? { stages: { places, current: num(g.c, 0), share: num(g.r, 0.5) } } : {}),
      },
    ]
  })
  const order = Array.isArray(value.o) ? value.o.filter((x: unknown): x is string => typeof x === "string") : []
  return { screens, order, window: isObject(value.w) ? value.w : {} }
}

// 前の形の URL を読む（matomezu の場所でなければ null）
function formerAddress(q: URLSearchParams): FormerAddress | null {
  const n = (v: string | null | undefined, fallback: number) => {
    const x = Number(v)
    return v !== null && v !== undefined && v !== "" && Number.isFinite(x) ? x : fallback
  }
  const stages: StagePlace[] = []
  for (let i = 0; q.has(`b${i}`); i++) {
    const [zoom, x, y] = (q.get(`v${i}`) ?? "").split(",")
    stages.push({
      book: q.get(`b${i}`) || null,
      page: q.get(`p${i}`) || null,
      zoom: n(zoom, 1),
      pan: { x: n(x, 0), y: n(y, 0) },
      states: statesOf(q.get(`s${i}`)),
    })
  }
  if (stages.length === 0 && !q.has("f")) return null
  return {
    former: true,
    front: q.get("f") === "center" ? "control-center" : "book-screen",
    stages,
    current: n(q.get("c"), 0),
    share: n(q.get("r"), 0.5),
    window: statesOf(q.get("w")),
  }
}

// 前の形の場所 former を、今の場所 now（開いているスクリーンの id を持つ）に重ねて、今の形にする: いちばん最近前に出したステージを並べるスクリーンに
// ステージの並びを当て（ステージが無ければ今のまま）、前に出すのは、その種類のいちばん最近前に出したスクリーン
export function fromFormer(former: FormerAddress, now: Address): Address {
  const book = recentStagesIn(now)
  const screens = now.screens.map(s =>
    s.id === book?.id && former.stages.length > 0
      ? { ...s, stages: { places: former.stages, current: former.current, share: former.share } }
      : s,
  )
  const recent = (stages: boolean) =>
    [...now.order].reverse().find(id => (now.screens.find(s => s.id === id)?.stages !== undefined) === stages)
  const to = recent(former.front === "book-screen")
  const order = to === undefined ? now.order : [...now.order.filter(id => id !== to), to]
  return { screens, order, window: former.window }
}

// URL の値を、画面の場所に入れるプラグイン状態にする（JSON のオブジェクトでなければ空）
function statesOf(text: string | null): Readonly<Record<string, unknown>> {
  if (text === null) return {}
  try {
    const value: unknown = JSON.parse(text)
    return isObject(value) ? value : {}
  } catch {
    return {}
  }
}

// インスタンスの画面の場所を URL と行き来させる。止める関数を返す
export function followLocation(
  instance: Pick<MatomezuInstance, "state" | "address" | "locate"> & { pushing?(): ReadonlySet<string> },
  place: Place = browserPlace,
) {
  // 読んだ場所を、今の形の場所にする（前の形の URL は、今開いているスクリーンに重ねる）
  const read = (found: Address | FormerAddress): Address =>
    "former" in found ? fromFormer(found, instance.address()) : found
  // URL が無い（開いた直後）なら、ステージを並べないスクリーン（コントロールセンター）を前に出す
  const start: Address | FormerAddress = parseSearch(place.search()) ?? {
    former: true,
    front: "control-center",
    stages: [],
    current: 0,
    share: 0.5,
    window: {},
  }
  instance.locate(read(start))
  let shown = instance.address()
  place.replace(searchOf(shown))
  let pending: (() => void) | null = null // まとめて書き換えるのを待っている書き換え（取り消す関数）
  let popping = false // 戻る・進むの場所を当てはめている間（URL に書き戻さない）
  let queued = false // 処理が終わってから書くのを待っている
  let stopped = false
  const write = () => {
    queued = false
    if (stopped || popping) return
    const now = instance.address()
    const search = searchOf(now)
    if (search === searchOf(shown)) return
    pending?.()
    pending = null
    if (moved(shown, now, instance.pushing?.())) place.push(search)
    else pending = place.later(() => place.replace(search))
    shown = now
  }
  const stopState = instance.state.subscribe(() => {
    if (popping || queued) return
    queued = true
    queueMicrotask(write)
  })
  // 戻る・進む: その URL の場所を当てはめ、今の場所として覚える（書き戻さない）
  const stopPop = place.onPop(() => {
    const address = parseSearch(place.search())
    if (!address) return
    pending?.()
    pending = null
    popping = true
    instance.locate(read(address))
    popping = false
    shown = instance.address()
  })
  return () => {
    stopped = true
    pending?.()
    stopState()
    stopPop()
  }
}
