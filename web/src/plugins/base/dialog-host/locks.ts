// ダイアログが開いている間に掛ける編集ロックの所
import { findBinder, findPage, NO_BINDER } from "../../../core/book"
import type { StageLineup } from "../../../core/schema/book"
import { NO_PAGE } from "../../../core/stage"
import { NO_LINEUP } from "../page-tabs/opened-lineup"

// 直している物 ids を、編集ロックを掛ける所（ページか、ブック・ブックの外のバインダ）ごとにまとめる: ページの id はそのページ、バインダの id は並び lineup の id（ブックか、ブックの外のバインダ）、
// ほかは開いているページ shown の中の物（並びが NO_LINEUP〈ブックの外のページ 1 枚を開いている〉なら、どれも開いているページの中の物。開いているページが NO_PAGE なら掛けない）
export function locksOf(
  lineup: StageLineup | typeof NO_LINEUP,
  shown: string,
  ids: readonly string[],
): { within: string; ids: string[] }[] {
  const locks = new Map<string, string[]>()
  for (const id of ids) {
    const inLineup = lineup !== NO_LINEUP
    const within =
      inLineup && findPage(lineup, id) !== NO_PAGE
        ? id
        : inLineup && findBinder(lineup, id) !== NO_BINDER
          ? lineup.id
          : shown
    if (within !== NO_PAGE) locks.set(within, [...(locks.get(within) ?? []), id])
  }
  return [...locks].map(([within, ids]) => ({ within, ids }))
}
