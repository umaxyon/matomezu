// 値を中まで凍らせる（書き換えると誤りになる）。凍った物の中は見ない（前に凍らせた物を共有しているので、変わった所だけを辿る）
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const v of Object.values(value)) deepFreeze(v)
  return value
}
