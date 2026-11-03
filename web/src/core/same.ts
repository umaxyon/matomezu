// 2 つのデータの値が同じか: 文字列にせずにたどって比べる（長い本文でも、比べるたびに文字列を作らない）。undefined のフィールドは無いのと同じ
type Fields = Readonly<Record<string, unknown>>

export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => sameData(x, b[i]))
  }
  const x = a as Fields
  const y = b as Fields
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every(k => sameData(x[k], y[k]))
}
