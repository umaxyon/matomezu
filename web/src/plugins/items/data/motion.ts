// グラフの動き: いつ動かすか（きっかけ）と、どう動かすか（印ごとの動き方）。どちらもテーマキーで変えられる。
// きっかけは、データを初めて描いたとき（draw）・表を入れ替えたとき（data）・見た目や軸を変えたとき（look）の 3 つ。
// きっかけごとの長さはテーマキー data-motion-draw・data-motion-data・data-motion-look で、0ms ならそのきっかけでは動かさない（CSS が使う）。
// 動き方は、棒（data-motion-bar）・折れ線（data-motion-line）・点（data-motion-dot）・円（data-motion-pie）ごとに、決まった言葉から選ぶ。
// 知らない言葉なら動かさない（組み立てのときに W015 を残す。check.ts）。大きさを変えた・選んだ・文字の領域をつまんだときは動かさない
import type { DataProps } from "./data"
import type { Table } from "./table"

// 印ごとに選べる動き方（none は動かさない）
export const MOTIONS = {
  bar: ["grow", "fade", "none"], // grow: 0 の線から伸びる
  line: ["draw", "fade", "none"], // draw: 左から線を引く
  dot: ["pop", "fade", "none"], // pop: 真ん中から膨らむ
  pie: ["sweep", "pop", "fade", "none"], // sweep: 12 時から右回りに広がる
} as const
export type MotionMark = keyof typeof MOTIONS
export type ChartMotions = { [K in MotionMark]: (typeof MOTIONS)[K][number] }

export const MOTION_TRIGGERS = ["draw", "data", "look"] as const
export type MotionTrigger = (typeof MOTION_TRIGGERS)[number]

// テーマが印の動き方のテーマキーに書いてよい値（テーマキーの id → 言葉の一覧）
export const MOTION_TOKENS = (Object.keys(MOTIONS) as MotionMark[]).map(mark => ({
  token: `data-motion-${mark}`,
  words: MOTIONS[mark] as readonly string[],
}))

// テーマキーに書いた値（前後の空白は除く）から、印ごとの動き方を選ぶ。read は動き方のテーマキーの名前（data-motion-bar など）の値を返す
export function chartMotions(read: (token: string) => string): ChartMotions {
  const pick = <K extends MotionMark>(mark: K): ChartMotions[K] => {
    const word = read(`data-motion-${mark}`).trim()
    return (MOTIONS[mark] as readonly string[]).includes(word) ? (word as ChartMotions[K]) : "none"
  }
  return { bar: pick("bar"), line: pick("line"), dot: pick("dot"), pie: pick("pie") }
}

// CSS の長さ（px）の値の数（前後の空白は除く。「4px」の形でなければ null）
export function pxOf(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  return m ? Number(m[1]) : null
}

// CSS の長さ（px）の値を数にする（px の長さでなければ fallback）
export const cssPx = (value: string, fallback: number): number => pxOf(value) ?? fallback

// 動かすかを決める、データの今の様子: 表と、グラフの形を変える項目（大きさ・文字・文字の領域の大きさは入れない）
export interface MotionState {
  table: string
  look: string
}

export function motionState(table: Table | undefined, props: DataProps): MotionState | null {
  if (!table) return null
  const { view, x, series, bar, sort, sortBy, label } = props
  return { table: JSON.stringify(table), look: JSON.stringify([view, x, series, bar, sort, sortBy, label]) }
}

// 前の様子 prev から次の様子 next になったときのきっかけ（変わっていなければ null）。表が無かった所に表が入ったのは data
export function motionOf(prev: MotionState | null | undefined, next: MotionState | null): MotionTrigger | null {
  if (!next) return null
  if (prev === undefined) return "draw"
  if (prev === null || prev.table !== next.table) return "data"
  return prev.look !== next.look ? "look" : null
}
