// アノテーションのレイヤー（伝言・マーク）が共通に使うフック

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { type Annotation, type Annotations, unexpired, usableAnnotations } from "../../../core/annotation"
import type { MessageKey } from "../../../core/i18n/i18n"
import { NO_PAGE } from "../../../core/stage"
import { useMatomezuState } from "../../../ui/store-context"
import { useActions, useCoreCatalog, usePage, usePerform } from "../../../ui/view-hooks"
import { refusalMessage } from "./refusal"
import { useNow } from "./useNow"
import { useOpenedPages } from "./useOpenedPages"

const NONE: readonly Annotation[] = []

// 期限を見直す間隔（ms）
const EXPIRY_CHECK_MS = 60_000

// 今の時点（ISO の時刻）。期限を見直す間隔ごとに進む
const useNowIso = (): string => new Date(useNow(EXPIRY_CHECK_MS)).toISOString()

// 描いているページの、効くアノテーション（usableAnnotations）。期限の過ぎた物は、常駐が消すまでの間も出さない（この窓で利用者が直している物は出す）
export function useAnnotationsIn(): readonly Annotation[] {
  const catalog = useCoreCatalog()
  const shown = usePage()
  const page = shown === NO_PAGE ? null : shown.id
  const all = useMatomezuState(s => (page && s.annotations[page]) || NONE)
  const settings = useMatomezuState(s => s.settings)
  const locked = useMatomezuState(
    useShallow(s => Object.values(s.editLocks).flatMap(l => ("within" in l && l.within === page ? l.ids : []))),
  )
  const now = useNowIso()
  const usable = useMemo(
    () => (shown === NO_PAGE ? NONE : usableAnnotations(catalog, shown, all)),
    [catalog, shown, all],
  )
  return useMemo(
    () => unexpired(catalog, usable, settings, now, new Set(locked)),
    [catalog, usable, settings, now, locked],
  )
}

// 描いている場所のステージで開いている物（ブックか、ブックの外のページ）の、ページごとの効くアノテーション（ページの id → 並び。1 つも無いページは持たない）。期限の過ぎた物は、常駐が消すまでの間も出さない（この窓で利用者が直している物は出す）
export function useOpenedAnnotations(): Annotations {
  const catalog = useCoreCatalog()
  const pages = useOpenedPages()
  const all = useMatomezuState(s => s.annotations)
  const settings = useMatomezuState(s => s.settings)
  const locks = useMatomezuState(s => s.editLocks)
  const now = useNowIso()
  return useMemo(() => {
    const out: Record<string, readonly Annotation[]> = {}
    for (const p of pages) {
      const list = all[p.id]
      if (!list) continue
      const locked = Object.values(locks).flatMap(l => ("within" in l && l.within === p.id ? l.ids : []))
      const live = unexpired(catalog, usableAnnotations(catalog, p, list), settings, now, new Set(locked))
      if (live.length > 0) out[p.id] = live
    }
    return out
  }, [catalog, pages, all, settings, now, locks])
}

// 描いているページの、種類 annotation のアノテーション
export function useAnnotationsOf(annotation: string): readonly Annotation[] {
  const all = useAnnotationsIn()
  return useMemo(() => all.filter(a => a.annotation === annotation), [all, annotation])
}

// アノテーションが対象のアクションを行う関数: 宛先は、描いているページ（page を渡せば、そのページ）。行えたら結果（無ければ {}）、断られたら断りをトーストに出して false を返す。
// refused は断りの理由が無いときの文言の鍵（呼ぶ機能の kit.message で頭を付けた物）
export function usePerformOrToast(
  refused: MessageKey,
): (action: string, args: unknown, page?: string) => false | object {
  const perform = usePerform() as (
    action: string,
    args: unknown,
    on: { page: string },
  ) => { ok: boolean; result?: unknown }
  const catalog = useCoreCatalog()
  const { showToast } = useActions()
  const shownPage = usePage()
  const drawn = shownPage === NO_PAGE ? undefined : shownPage.id
  return (action, args, page) => {
    const on = page ?? drawn
    // 宛先のページが無ければ行わず、断りの理由の無い断りと同じに知らせる
    const done = on === undefined ? null : perform(action, args, { page: on })
    if (done?.ok) return (done.result as object | undefined) ?? {}
    showToast({ kind: "warn", message: done ? refusalMessage(catalog, done as never, refused) : refused })
    return false
  }
}
