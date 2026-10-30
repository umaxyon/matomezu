// グラフの値の軸の目盛り: 値の範囲を、きりのよい刻み（1・2・5 の 10 のべき倍）で 4〜6 本ほどに分ける。目盛りの文字は 3 桁ごとに , で区切る
export interface Ticks {
  min: number // 軸の下の端（一番下の目盛り）
  max: number // 軸の上の端（一番上の目盛り）
  values: number[] // 目盛りの値（下から）
  step: number
}

// きりのよい刻み（range を約 count 本に分ける）
function niceStep(range: number, count: number): number {
  const raw = range / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / pow
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow
}

// lo〜hi を含む目盛り（zero なら 0 も含める。範囲が無ければ、その値のまわりに 1 刻み）
export function niceTicks(lo: number, hi: number, zero: boolean, count = 5): Ticks {
  let a = zero ? Math.min(lo, 0) : lo
  let b = zero ? Math.max(hi, 0) : hi
  if (a === b) {
    a = a === 0 ? 0 : a - Math.abs(a) / 2
    b = b === 0 ? 1 : b + Math.abs(b) / 2
  }
  const step = niceStep(b - a, count)
  const min = round(Math.floor(a / step + 1e-9) * step, step)
  const max = round(Math.ceil(b / step - 1e-9) * step, step)
  const values: number[] = []
  for (let v = min; v <= max + step / 2; v += step) values.push(round(v, step))
  return { min, max, values, step }
}

// 刻みの桁で丸めた値（足し算の誤差を消す）
const decimals = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
const round = (v: number, step: number): number => Number(v.toFixed(decimals(step)))

// 3 桁ごとに , で区切った数の文字（小数は digits 桁まで）
export function formatNumber(v: number, digits?: number): string {
  const fixed = digits === undefined ? String(v) : v.toFixed(digits)
  const [int = "", frac] = fixed.split(".")
  const sign = int.startsWith("-") ? "-" : ""
  const body = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return sign + body + (frac ? `.${frac}` : "")
}

// 目盛りの文字（刻みの桁にそろえる）
export const tickText = (v: number, ticks: Ticks): string => formatNumber(v, decimals(ticks.step))
