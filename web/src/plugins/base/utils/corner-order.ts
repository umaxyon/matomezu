// 物の右上の角に出す物（corner.tsx）の並べ方: 物ごとに分け、order の小さい物が先、同じ order なら at（ISO 8601 の時点）の新しい物が先、同じなら後に登録した物が先。

// 角に出す物の登録（V は絵の型。並べ方は絵を見ない）
export interface CornerEntry<V = unknown> {
  anchor: string // 角に出す物の id
  order: number // 並べる順（小さい方が先）
  at: string // 同じ order の中の順（新しい方が先）
  look: V // まとめた絵に重ねる、押せない絵
  pointer: V | null // 物が見える所の外にある間に縁に出す印（StandPointer など。無ければ null）
  seq: number // 登録した順
}

// 並べた角に出す物（id と登録）
export interface PlacedCorner<V = unknown> {
  id: string
  entry: CornerEntry<V>
}

// 角に出す物 entries を、物ごとに並べる順に並べた表（物の順は、物が最初に登録された順）
export function cornersByAnchor<V>(
  entries: ReadonlyMap<string, CornerEntry<V>>,
): ReadonlyMap<string, readonly PlacedCorner<V>[]> {
  const groups = new Map<string, PlacedCorner<V>[]>()
  for (const [id, entry] of [...entries].sort(([, a], [, b]) => a.seq - b.seq)) {
    const group = groups.get(entry.anchor) ?? []
    group.push({ id, entry })
    groups.set(entry.anchor, group)
  }
  const first = (a: PlacedCorner<V>, b: PlacedCorner<V>) =>
    a.entry.order !== b.entry.order
      ? a.entry.order - b.entry.order
      : a.entry.at !== b.entry.at
        ? a.entry.at < b.entry.at
          ? 1
          : -1
        : b.entry.seq - a.entry.seq
  return new Map([...groups].map(([anchor, group]) => [anchor, group.sort(first)]))
}
