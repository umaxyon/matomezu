// ブラウザの URL と画面の場所（core/address.ts）の行き来（ルーターは入れない。開いている場所は store が持ち、URL はそれを映す）。
// 開いたときは URL の場所を当てはめ（store の locate）、見ているものが変わったら URL に書く。移動（ステージの数か、ブック・ページが変わった。積むと宣言した画面の状態の値が変わった）
// ならブラウザの履歴に積み（pushState。行の番号を {i} に持ち、戻る先があるかを store に知らせる）、倍率・ずらす量・カレント・境目だけなら、しばらく待ってまとめて書き換える（replaceState）。同じ同期の処理の中の
// 変わりは、終わってから 1 つにまとめて書く（分割してブックとページを開いても、ブラウザの履歴に積むのは 1 つ）。その中で書き換えを頼まれた（store の replaceHistory で historyReplaces が増えた）なら、積まずにすぐ書き換える。ブラウザの戻る・進む（popstate）は、その URL の場所を当てはめる。
// URL の形: 値 1 つ（sc）に、場所を短い名前の JSON で書く（searchOf）。前の形（b0・p0・v0・s0…、c・r・w・f）は読むだけで、書かない。
// URL が無ければ、開いた直後はステージを並べないスクリーン（コントロールセンター）をカレントスクリーンにする。プラグイン状態の中身は読まない（形を確かめるのは store の locate）
import { type Address, moved, recentStagesIn, type ScreenPlace, type StagePlace } from "../core/address"
import { stagesDefOf } from "../core/window"
import type { MatomezuInstance } from "../store/store"

// URL とのやり取り（テストでは差し替える）
export interface Place {
  search(): string // 今の URL の ? から後ろ
  index(): number // 今のブラウザの履歴の行の、この窓が積んだ順の番号（窓が積んだ最初の行が 0。無ければ 0）
  push(search: string, index: number): void // ブラウザの履歴に、番号 index の行として積む
  replace(search: string): void // 今のブラウザの履歴を書き換える（行の番号は変えない）
  back(): void // ブラウザの履歴を 1 つ戻す
  onPop(listener: () => void): () => void // 戻る・進むで URL が変わったら呼ぶ。止める関数を返す
  later(run: () => void): () => void // しばらくしてから run を呼ぶ（書き換えをまとめる）。取り消す関数を返す
}

// 倍率・ずらす量などの書き換えをまとめる間（ms。紙をずらしている間に何度も書き換えない）
export const REPLACE_AFTER = 300

export const browserPlace: Place = {
  search: () => window.location.search,
  index: () => {
    const state: unknown = window.history.state
    const i = typeof state === "object" && state !== null ? (state as { i?: unknown }).i : undefined
    return typeof i === "number" && Number.isInteger(i) && i > 0 ? i : 0
  },
  push: (search, index) => window.history.pushState({ i: index }, "", search),
  replace: search => window.history.replaceState(window.history.state, "", search),
  back: () => window.history.back(),
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
// g はステージを並べるスクリーンの中）、o はカレントにした順、a はスクリーンアレンジメントの定義の id、w は窓の範囲のプラグイン状態。g の l はステージの並び（b はブックの id、p はページの id、
// v は倍率・横・縦、s はステージの範囲のプラグイン状態）、c はカレントの番号、r は境目の割合。空の物は書かない
interface Written {
  s: { i: string; d: string; p?: unknown; t?: Record<string, unknown>; g?: WrittenStages }[]
  o: string[]
  a: string
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
                ...(p.binder !== null ? { f: p.binder } : {}),
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
    a: address.arrangement,
    ...(emptyProps(address.arrangementValue) ? {} : { av: address.arrangementValue }),
    ...(some(address.window) ? { w: { ...address.window } } : {}),
  }
  const q = new URLSearchParams()
  q.set("sc", JSON.stringify(written))
  return `?${q.toString()}`
}

// 前の形の URL から読んだ場所: カレントスクリーンの種類（ステージを並べるスクリーンか、そうでないスクリーンか）と、ブックスクリーンのステージの並び
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
          binder: typeof p.f === "string" ? p.f : null,
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
  const arrangement = typeof value.a === "string" ? value.a : ""
  return { screens, order, arrangement, arrangementValue: value.av ?? {}, window: isObject(value.w) ? value.w : {} }
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
      binder: null,
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

// 前の形で、重ねて開いたスクリーンを書いていた、窓の範囲の値の名前
const FORMER_OPENED = "@matomezu/base:open-screen"

// 前の形の場所 former を、今の場所 now（開いているスクリーンの id を持つ）に重ねて、今の形にする: いちばん最近カレントにしたステージを並べるスクリーンに
// ステージの並びを当て（ステージが無ければ今のまま）、カレントスクリーンにするのは、その種類のいちばん最近カレントにしたスクリーン
export function fromFormer(former: FormerAddress, now: Address, stagesDef?: string): Address {
  // ステージの並びを持つ場所なのに、ステージを並べるスクリーンが 1 枚も開いていなければ、1 枚足す（定義 stagesDef）
  const lacks = former.stages.length > 0 && stagesDef !== undefined && !recentStagesIn(now)
  const made = `c${Math.max(0, ...now.screens.map(s => Number(s.id.slice(1)) || 0)) + 1}`
  const at: Address = lacks
    ? {
        ...now,
        screens: [
          ...now.screens,
          { id: made, def: stagesDef, props: {}, states: {}, stages: { places: [], current: 0, share: 0.5 } },
        ],
        order: [...now.order, made],
      }
    : now
  const book = recentStagesIn(at)
  const screens = at.screens.map(s =>
    s.id === book?.id && former.stages.length > 0
      ? { ...s, stages: { places: former.stages, current: former.current, share: former.share } }
      : s,
  )
  const recent = (stages: boolean) =>
    [...at.order].reverse().find(id => (at.screens.find(s => s.id === id)?.stages !== undefined) === stages)
  const to = recent(former.front === "book-screen")
  const order = to === undefined ? at.order : [...at.order.filter(id => id !== to), to]
  // 前の形では、重ねて開いたスクリーン（チケットスクリーンなど）を窓の範囲の値 1 つに書いていた。開いているスクリーンの 1 枚に直す
  const { [FORMER_OPENED]: opened, ...window } = former.window
  if (!isObject(opened) || typeof opened.screen !== "string")
    return { screens, order, arrangement: at.arrangement, arrangementValue: at.arrangementValue, window }
  const id = `c${Math.max(0, ...at.screens.map(s => Number(s.id.slice(1)) || 0)) + 1}`
  const added: ScreenPlace = { id, def: opened.screen, props: opened.props ?? {}, states: {} }
  const front = former.front === "book-screen" ? [id, ...order] : [...order, id]
  return {
    screens: [...screens, added],
    order: front,
    arrangement: at.arrangement,
    arrangementValue: at.arrangementValue,
    window,
  }
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
  instance: Pick<MatomezuInstance, "state" | "address" | "locate" | "catalog"> & {
    pushing?(): ReadonlySet<string>
    setCanGoBack?(can: boolean): void
  },
  place: Place = browserPlace,
) {
  // 読んだ場所を、今の形の場所にする（前の形の URL は、今開いているスクリーンに重ねる）
  const read = (found: Address | FormerAddress): Address =>
    "former" in found ? fromFormer(found, instance.address(), stagesDefOf(instance.catalog.core)) : found
  // URL が無い（開いた直後）なら、ステージを並べないスクリーン（コントロールセンター）をカレントスクリーンにする
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
  // この窓の中に戻る先があるか（窓が積んだ行の番号が 0 より大きい）を、store に知らせる
  const knowBack = () => instance.setCanGoBack?.(place.index() > 0)
  knowBack()
  let pending: (() => void) | null = null // まとめて書き換えるのを待っている書き換え（取り消す関数）
  let popping = false // 戻る・進むの場所を当てはめている間（URL に書き戻さない）
  let queued = false // 処理が終わってから書くのを待っている
  let stopped = false
  let replaces = instance.state.getState().historyReplaces // 書き換えてほしいと頼まれた回数（増えていれば、積まずに書き換える）
  const write = () => {
    queued = false
    if (stopped || popping) return
    const asked = instance.state.getState().historyReplaces
    const replacing = asked !== replaces
    replaces = asked
    const now = instance.address()
    const search = searchOf(now)
    if (search === searchOf(shown)) return
    pending?.()
    pending = null
    if (replacing) place.replace(search)
    else if (moved(shown, now, instance.pushing?.())) {
      place.push(search, place.index() + 1)
      knowBack()
    } else pending = place.later(() => place.replace(search))
    shown = now
  }
  // 画面が頼んだ「ブラウザの履歴を 1 つ戻す」（backRequests が増えたら戻す。戻った場所は、下の戻る・進むで当てはまる）
  let backed = instance.state.getState().backRequests
  const stopState = instance.state.subscribe(state => {
    if (state.backRequests !== backed) {
      backed = state.backRequests
      place.back()
      return
    }
    if (popping || queued) return
    queued = true
    queueMicrotask(write)
  })
  // 戻る・進む: その URL の場所を当てはめ、今の場所として覚える（書き戻さない）
  const stopPop = place.onPop(() => {
    knowBack()
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
