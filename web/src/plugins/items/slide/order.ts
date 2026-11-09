// 選んだアイテムの重ねの順を動かす手順（ページの slide の並びは、あとの物ほど手前）。
// 選んだ物どうしの前後は保つ。端まで動いた物は動かさず、その先へ別の選んだ物が越えない
export type Order = "front" | "back" | "forward" | "backward"

// 手順の 1 つ: アイテムを、to へ動かす（1 つ前・後ろは 1 段）。list は今の並び（後ろから前へ）、selected は選んだ物の id
export interface OrderStep {
  item: string
  to: Order
}

export function orderSteps(list: readonly string[], selected: ReadonlySet<string>, to: Order): OrderStep[] {
  const chosen = list.map((id, index) => ({ id, index })).filter(s => selected.has(s.id))
  if (to === "front") return chosen.map(s => ({ item: s.id, to }))
  if (to === "back") return chosen.reverse().map(s => ({ item: s.id, to }))
  const steps: OrderStep[] = []
  if (to === "forward") {
    // 前にある物から。端にいる物は動かさず、その下の物はそのすぐ下で止める
    let limit = list.length - 1
    for (const s of chosen.reverse()) {
      if (s.index >= limit) {
        limit = s.index - 1
        continue
      }
      steps.push({ item: s.id, to })
      limit = s.index
    }
    return steps
  }
  let limit = 0
  for (const s of chosen) {
    if (s.index <= limit) {
      limit = s.index + 1
      continue
    }
    steps.push({ item: s.id, to })
    limit = s.index
  }
  return steps
}
