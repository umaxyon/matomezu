// 付ける先の鳥の割り当て: 付ける先の並びが替わるたびに、どの物にどの鳥を出すかを決め直す純粋な計算。
// 残った物は同じ鳥のまま。外れた物の鳥は、足された物へ順に移る（飛んで移る）。余った鳥は飛び去る。足りなければ、出ていない鳥からでたらめに選ぶ（5 羽とも出ていれば、かぶってよい）
import { BIRD_IDS, type Bird } from "."

export interface Assigned {
  birds: Readonly<Record<string, Bird>> // 付ける先 → 鳥
  moved: Readonly<Record<string, string>> // 足された物 → 鳥が移ってくる前の物
  left: readonly { anchor: string; bird: Bird }[] // 飛び去る鳥と、その鳥がいた物
}

// 前の割り当て prev から、付ける先 anchors の割り当て（random は 0 以上 1 未満の数を返す）
export function assignBirds(
  prev: Readonly<Record<string, Bird>>,
  anchors: readonly string[],
  random: () => number,
): Assigned {
  const birds: Record<string, Bird> = {}
  for (const id of anchors) if (prev[id]) birds[id] = prev[id]
  const gone = Object.keys(prev).filter(id => !anchors.includes(id))
  const moved: Record<string, string> = {}
  for (const id of anchors) {
    if (birds[id]) continue
    const from = gone.shift()
    if (from !== undefined) {
      birds[id] = prev[from] as Bird
      moved[id] = from
      continue
    }
    const shown = new Set(Object.values(birds))
    const free = BIRD_IDS.filter(b => !shown.has(b))
    const pool = free.length > 0 ? free : BIRD_IDS
    birds[id] = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] as Bird
  }
  return { birds, moved, left: gone.map(anchor => ({ anchor, bird: prev[anchor] as Bird })) }
}
