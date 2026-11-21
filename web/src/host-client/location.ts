// ブラウザの URL と画面の場所（core/address.ts）の行き来（ルーターは入れない。開いている場所は store が持ち、URL はそれを映す）。
// 開いたときは URL の場所を当てはめ（store の locate）、見ているものが変わったら URL に書く。移動（ステージの数か、ブック・ページが変わった。積むと宣言した画面の状態の値が変わった）
// ならブラウザの履歴に積み（pushState。行の番号を {i} に持ち、戻る先があるかを store に知らせる）、倍率・ずらす量・カレント・境目だけなら、しばらく待ってまとめて書き換える（replaceState）。同じ同期の処理の中の
// 変わりは、終わってから 1 つにまとめて書く（分割してブックとページを開いても、ブラウザの履歴に積むのは 1 つ）。その中で書き換えを頼まれた（store の replaceHistory で historyReplaces が増えた）なら、積まずにすぐ書き換える。ブラウザの戻る・進む（popstate）は、その URL の場所を当てはめる。
// URL の形: 値 1 つ（sc）に、場所を短い名前の JSON で書く（searchOf）。
// URL が無ければ、開いた直後はステージを並べないスクリーン（コントロールセンター）をカレントスクリーンにする。プラグイン状態の中身は読まない（形を確かめるのは store の locate）
import { type Address, moved, type ScreenPlace, type StagePlace } from "../core/address"
import { NO_OUTERMOST } from "../core/folders-tree"
import type { MatomezuInstance } from "../store/state"

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
// g はステージを並べるスクリーンの中）、o はカレントにした順、a はスクリーンアレンジメントの定義の id、av はその値、w は窓の範囲のプラグイン状態。g の l はステージの並び（b はブックの id、
// p はページの id、f はバインダの id、v は倍率・横・縦、s はステージの範囲のプラグイン状態）、c はカレントの番号、r は境目の割合。空の物は書かない
interface Written {
  s: { i: string; d: string; p?: unknown; t?: Record<string, unknown>; g?: WrittenStages }[]
  o: string[]
  a: string
  av?: unknown
  w?: Record<string, unknown>
}
interface WrittenStages {
  l: { b: string | null; p?: string; f?: string; v: [number, number, number]; s?: Record<string, unknown> }[]
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
                b: p.outermost === NO_OUTERMOST ? null : p.outermost,
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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

// URL の ? から後ろを場所にする（matomezu の場所でなければ null）
export function parseSearch(search: string): Address | null {
  const sc = new URLSearchParams(search).get("sc")
  return sc === null ? null : writtenAddress(sc)
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
          outermost: typeof p.b === "string" && p.b !== "" ? p.b : NO_OUTERMOST,
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

// 場所 now の、いちばん最近カレントにしたステージを並べないスクリーンを、カレントスクリーンにした場所（無ければ同じ場所）
function plainCurrent(now: Address): Address {
  const to = [...now.order].reverse().find(id => now.screens.find(s => s.id === id)?.stages === undefined)
  return to === undefined ? now : { ...now, order: [...now.order.filter(id => id !== to), to] }
}

// インスタンスの画面の場所を URL と行き来させる。止める関数を返す
export function followLocation(
  instance: Pick<MatomezuInstance, "state" | "address" | "locate"> & {
    pushing?(): ReadonlySet<string>
    setCanGoBack?(can: boolean): void
  },
  place: Place = browserPlace,
) {
  // URL が無い（開いた直後）なら、ステージを並べないスクリーン（コントロールセンター）をカレントスクリーンにする
  instance.locate(parseSearch(place.search()) ?? plainCurrent(instance.address()))
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
    instance.locate(address)
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
