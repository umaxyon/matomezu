// 改ページ: 並べ方が決まっている見せ方（ツリー・ディレクトリ構成図）が、印刷のときだけ、印刷区画の境目をまたぐ物とそれより先の物を、
// 次の印刷区画の頭まで送る（データと書く画面の並びは変えない）。送る向きごとに、物の始まり at と長さ size を受け取り、
// 元の位置を送る量を返す関数を作る。印刷区画より長い物は送っても入らないので、送らない（紙の境目で切れる）
export function breakShift(
  spans: readonly { at: number; size: number }[],
  len: number,
  head: number,
): (at: number) => number {
  const breaks: { from: number; shift: number }[] = []
  let shift = 0
  for (const s of [...spans].sort((a, b) => a.at - b.at)) {
    if (s.size > len - head) continue
    const start = s.at + shift
    const end = start + s.size
    if (Math.floor(start / len) === Math.floor((end - 1e-9) / len)) continue
    shift += (Math.floor(start / len) + 1) * len + head - start
    breaks.push({ from: s.at, shift })
  }
  return at => {
    let found = 0
    for (const b of breaks) if (b.from <= at) found = b.shift
    return found
  }
}
