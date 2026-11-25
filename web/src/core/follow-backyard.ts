// フォローステップがバックヤードの中に行う事（core/def/follow-step.ts の BackyardFollow）を、書庫の変わりとアノテーションの変わりにする所
import type { Annotation, Annotations } from "./annotation"
import type { BackyardFollow } from "./def/follow-step"
import { backyardBookOf, removedEntry, rowsWithin } from "./entries"
import type { Library, TableChanges } from "./folders"
import { noChanges, rowChanges } from "./folders-changes"

// 当てた結果: 書庫の変わり changes（無ければ無い）と、アノテーションが変わったページの id → 新しい並び（消したなら空）。
// 当てるブックの行を持っていなければ、その id の並び needs（常駐が、そのブックの行を足して行い直す）
export type BackyardFollowed =
  | { ok: true; changes?: TableChanges; annotations: Annotations }
  | { ok: false; needs: readonly string[] }

// 書庫 library とアノテーション annotations に、バックヤードの中に行う事 does を順に当てる。バックヤードの行かブックが無い物は、何もしない
export function followedInBackyard(
  library: Library,
  annotations: Annotations,
  does: readonly BackyardFollow[],
): BackyardFollowed {
  let now = library
  const changed: Record<string, readonly Annotation[]> = {}
  const needs: string[] = []
  const clear = (pages: readonly string[]) => {
    for (const p of pages) if ((annotations[p]?.length ?? 0) > 0 && changed[p] === undefined) changed[p] = []
  }
  for (const d of does) {
    const book = backyardBookOf(now, d.backyard, d.key)
    if (book === undefined) continue
    if (!(book in now.folders)) {
      needs.push(book)
      continue
    }
    if (d.does === "retitle") {
      const row = now.folders[book]
      if (row?.folderRole === "book" && d.title !== "" && row.title !== d.title)
        now = { ...now, folders: { ...now.folders, [book]: { ...row, title: d.title } } }
      continue
    }
    clear(rowsWithin(now.folders, book).pages)
    if (d.does === "clear-annotations") continue
    const next = removedEntry(now, book)
    if (typeof next !== "string") now = next
  }
  if (needs.length > 0) return { ok: false, needs: [...new Set(needs)] }
  const changes = now === library ? undefined : rowChanges(library, now)
  return { ok: true, ...(changes && !noChanges(changes) ? { changes } : {}), annotations: changed }
}
