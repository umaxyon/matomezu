// ブラウザの URL と画面の場所（core/address.ts）の行き来（ルーターは入れない。開いている場所は store が持ち、URL はそれを映す）。
// 開いたときは URL の場所を当てはめ（store の locate）、見ているものが変わったら URL に書く。移動（ステージの数か、ブック・ページが変わった。積むと宣言した画面の状態の値が変わった）
// ならブラウザの履歴に積み（pushState）、倍率・ずらす量・カレント・境目だけなら、しばらく待ってまとめて書き換える（replaceState）。同じ同期の処理の中の
// 変わりは、終わってから 1 つにまとめて書く（分割してブックとページを開いても、ブラウザの履歴に積むのは 1 つ）。ブラウザの戻る・進む（popstate）は、その URL の場所を当てはめる。
// URL の形: ステージごとに b0（ブックの id。何も開いていなければ空）・p0（ページの id。無ければ書かない）・v0（倍率,横,縦）・
// s0（ステージの、場所に入れる画面の状態。宣言の id → 値の JSON。無ければ書かない）、続けて b1・p1・v1・s1 …、w（窓の外の、場所に入れる画面の状態。宣言の id → 値の JSON。無ければ書かない）、f（コントロールセンターを前に出している間だけ center。ブックスクリーンを前に出している間は書かない）・c（カレントの番号）・r（境目の割合）。
// ステージの無い URL（f だけ）は、前に出す物だけを決める。URL が無ければ、開いた直後はコントロールセンターを前に出す。
// id にどの文字が入っても読み戻せるように、ステージの値ごとに分けて書く。画面の状態の中身は読まない（形を確かめるのは store の locate）
import { type Address, moved, type StagePlace } from "../core/address"
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

// 場所を URL の ? から後ろにする
export function searchOf(address: Address): string {
  const q = new URLSearchParams()
  address.stages.forEach((s, i) => {
    q.set(`b${i}`, s.book ?? "")
    if (s.page !== null) q.set(`p${i}`, s.page)
    q.set(`v${i}`, `${round(s.zoom)},${round(s.pan.x)},${round(s.pan.y)}`)
    if (Object.keys(s.states).length > 0) q.set(`s${i}`, JSON.stringify(s.states))
  })
  if (Object.keys(address.frame).length > 0) q.set("w", JSON.stringify(address.frame))
  if (address.front === "control-center") q.set("f", "center")
  q.set("c", String(address.current))
  q.set("r", String(round(address.share)))
  return `?${q.toString()}`
}

// URL の ? から後ろを場所にする（matomezu の場所でなければ null）
export function parseSearch(search: string): Address | null {
  const q = new URLSearchParams(search)
  const num = (v: string | null | undefined, fallback: number) => {
    const n = Number(v)
    return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : fallback
  }
  const stages: StagePlace[] = []
  for (let i = 0; q.has(`b${i}`); i++) {
    const [zoom, x, y] = (q.get(`v${i}`) ?? "").split(",")
    stages.push({
      book: q.get(`b${i}`) || null,
      page: q.get(`p${i}`) || null,
      zoom: num(zoom, 1),
      pan: { x: num(x, 0), y: num(y, 0) },
      states: statesOf(q.get(`s${i}`)),
    })
  }
  const front = q.get("f") === "center" ? "control-center" : "book-screen"
  if (stages.length === 0 && !q.has("f")) return null
  return { front, stages, current: num(q.get("c"), 0), share: num(q.get("r"), 0.5), frame: statesOf(q.get("w")) }
}

// URL の s0・w などの値を、場所に入れる画面の状態にする（JSON のオブジェクトでなければ空）
function statesOf(text: string | null): Readonly<Record<string, unknown>> {
  if (text === null) return {}
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// インスタンスの画面の場所を URL と行き来させる。止める関数を返す
export function followLocation(
  instance: Pick<MatomezuInstance, "state" | "address" | "locate"> & { pushing?(): ReadonlySet<string> },
  place: Place = browserPlace,
) {
  // URL が無い（開いた直後）なら、コントロールセンターを前に出す
  const start = parseSearch(place.search()) ?? {
    front: "control-center" as const,
    stages: [],
    current: 0,
    share: 0.5,
    frame: {},
  }
  instance.locate(start)
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
