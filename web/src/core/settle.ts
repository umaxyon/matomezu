// アクションの結果の形の確かめ（ブックの一覧・郵便箱・参加者の表・レコードで同じ形）:
// id が重ならず、前 before に無かった（変わった）物だけが、形の確かめ fits を通る。前からある物は、変えなければ見ない
export function settledAfter<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  fits: (item: T) => boolean,
): boolean {
  if (new Set(after.map(x => x.id)).size !== after.length) return false
  const kept = new Set(before)
  return after.every(x => kept.has(x) || fits(x))
}
