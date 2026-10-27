// ブラウザの URL と画面の場所（core/address.ts）の行き来（OVERHAUL 4.5: ルーターは入れない。移動の履歴は store が持ち、URL はそれを映す）。
// 開いたときは URL の場所を当てはめ（store の locate）、見ているものが変わったら URL に書く。移動（ステージの数か、ブック・ページが変わった）
// なら履歴に積み（pushState）、倍率・ずらす量・カレント・境目だけなら、しばらく待ってまとめて書き換える（replaceState）。ブラウザの戻る・進む（popstate）は、
// その URL の場所を当てはめる。
// URL の形: ステージごとに b0（ブックの id。何も開いていなければ空）・p0（ページの id。無ければ書かない）・v0（倍率,横,縦）、
// 続けて b1・p1・v1 …、c（カレントの番号）・r（境目の割合）。id にどの文字が入っても読み戻せるように、ステージの値ごとに分けて書く
import { type Address, addressOf, moved, type StagePlace } from "../core/address"
import type { MatomezuInstance } from "../store/store"

// URL とのやり取り（テストでは差し替える）
export interface Place {
  search(): string // 今の URL の ? から後ろ
  push(search: string): void // 履歴に積む
  replace(search: string): void // 今の履歴を書き換える
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
  })
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
    })
  }
  if (stages.length === 0) return null
  return { stages, current: num(q.get("c"), 0), share: num(q.get("r"), 0.5) }
}

// インスタンスの画面の場所を URL と行き来させる。止める関数を返す
export function followLocation(instance: Pick<MatomezuInstance, "state" | "locate">, place: Place = browserPlace) {
  const start = parseSearch(place.search())
  if (start) instance.locate(start)
  let shown = addressOf(instance.state.getState().workspace)
  place.replace(searchOf(shown))
  let pending: (() => void) | null = null // まとめて書き換えるのを待っている書き換え（取り消す関数）
  let popping = false // 戻る・進むの場所を当てはめている間（URL に書き戻さない）
  const stopState = instance.state.subscribe(state => {
    if (popping) return
    const now = addressOf(state.workspace)
    const search = searchOf(now)
    if (search === searchOf(shown)) return
    pending?.()
    pending = null
    if (moved(shown, now)) place.push(search)
    else pending = place.later(() => place.replace(search))
    shown = now
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
    shown = addressOf(instance.state.getState().workspace)
  })
  return () => {
    pending?.()
    stopState()
    stopPop()
  }
}
