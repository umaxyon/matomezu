// base の中で使う、データのフィールドを、保存されるフィールドの並びを保ったまま変える処理（プラグインには公開しない）
// key の値を value にする（無ければ after のうち最後に出てくるフィールドの後ろに足す。undefined なら消す）
export function setField<T extends object>(v: T, after: readonly string[], key: string, value: unknown): T {
  const entries = Object.entries(v).filter(([k]) => k !== key)
  if (value === undefined) return Object.fromEntries(entries) as T
  const at = entries.reduce((last, [k], i) => (after.includes(k) ? i + 1 : last), 0)
  return Object.fromEntries([...entries.slice(0, at), [key, value], ...entries.slice(at)]) as T
}
