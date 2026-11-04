// id の扱い: アクションの中で振る、ほかと重ならない短い id と、id を持つ物が変わったかの比べ。
// 短い id は、newId（アクションの文脈が振る値）から作るので、
// 同じ newId の並びで行い直せば同じ id になる（画面で先に行い、常駐で行い直しても食い違わない）。taken と重なれば振り直す
import { fail } from "./errors"
import { sameData } from "./same"

export function freshId(newId: () => string, taken: Iterable<string>): string {
  return idMaker(newId, taken)()
}

// 続けて何個も振る関数: 振った id を使われている id に足しながら振るので、振った id どうしも重ならない
export function idMaker(newId: () => string, taken: Iterable<string>): () => string {
  const used = new Set(taken)
  return () => {
    for (let i = 0; i < 100; i++) {
      const id = newId().replace(/-/g, "").slice(0, 10)
      if (id !== "" && !used.has(id)) {
        used.add(id)
        return id
      }
    }
    return fail("E112")
  }
}

// 値の中の、どの深さのオブジェクトの id（文字列のフィールド id）も集める（ページの中の物の id を、中の作りを知らずに集めるのに使う）
export function idsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(idsIn)
  if (typeof value !== "object" || value === null) return []
  return Object.entries(value).flatMap(([k, v]) => (k === "id" ? (typeof v === "string" ? [v] : []) : idsIn(v)))
}

// 値の中の、どの深さのオブジェクトも、id（文字列のフィールド id）→ そのオブジェクトの表にする（中の作りを知らずに、物を id で引くのに使う）
function objectsById(value: unknown, into = new Map<string, unknown>()): Map<string, unknown> {
  if (Array.isArray(value)) for (const v of value) objectsById(v, into)
  else if (typeof value === "object" && value !== null) {
    const { id } = value as { id?: unknown }
    if (typeof id === "string") into.set(id, value)
    for (const v of Object.values(value)) objectsById(v, into)
  }
  return into
}

// 物 ids のうち、値 before にあって、after では変わったか無くなったもの（物の中の物が変わっても、変わったとする）
export function changedIn(before: unknown, after: unknown, ids: readonly string[]): string[] {
  const was = objectsById(before)
  const now = objectsById(after)
  return ids.filter(id => was.has(id) && !sameData(was.get(id), now.get(id)))
}
