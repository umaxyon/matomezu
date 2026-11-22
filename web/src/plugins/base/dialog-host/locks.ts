// ダイアログが開いている間に掛ける編集ロックの所
import { findBinder, findPage } from "../../../core/book"
import type { StageLineup } from "../../../core/schema/book"

// 直している物 ids を、編集ロックを掛ける所（ページか、ブック・ブックの外のバインダ）ごとにまとめる: ページの id はそのページ、バインダの id は並び lineup の id（ブックか、ブックの外のバインダ）、
// ほかは開いているページ shown の中の物（並びが無い〈ブックの外のページ 1 枚を開いている〉なら、どれも開いているページの中の物）
export function locksOf(
  lineup: StageLineup | null,
  shown: string | null,
  ids: readonly string[],
): { within: string; ids: string[] }[] {
  const locks = new Map<string, string[]>()
  for (const id of ids) {
    const within = lineup && findPage(lineup, id) ? id : lineup && findBinder(lineup, id) ? lineup.id : shown
    if (within !== null) locks.set(within, [...(locks.get(within) ?? []), id])
  }
  return [...locks].map(([within, ids]) => ({ within, ids }))
}
