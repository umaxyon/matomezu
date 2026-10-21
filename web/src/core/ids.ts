// アクションの中で振る、ほかと重ならない短い id。newId（アクションの文脈が振る値）から作るので、
// 同じ newId の並びで行い直せば同じ id になる（画面で先に行い、常駐で行い直しても食い違わない）。taken と重なれば振り直す
import { fail } from "./errors"

export function freshId(newId: () => string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let i = 0; i < 100; i++) {
    const id = newId().replace(/-/g, "").slice(0, 10)
    if (id !== "" && !used.has(id)) return id
  }
  return fail("E112")
}
