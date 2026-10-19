// 頭の文字と番号でできた id のうち、使っていない一番小さい番号
export function nextNumber(prefix: string, used: readonly string[]): number {
  const taken = new Set(used)
  let n = 1
  while (taken.has(`${prefix}${n}`)) n++
  return n
}
