// アノテーションのレイヤー（伝言・マーク）が共通に使うフック

import { useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { type Annotation, type Annotations, unexpired } from "../../../core/annotation"
import { pagesOf } from "../../../core/book"
import type { MessageKey } from "../../../core/i18n/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { useActions, useBook, useCoreCatalog, usePage, usePerform } from "../../../ui/view-hooks"
import { refusalMessage } from "./refusal"

const NONE: readonly Annotation[] = []

// 期限を見直す間隔（ms）
const EXPIRY_CHECK_MS = 60_000

// 今の時点（ISO の時刻）。期限を見直す間隔ごとに進む
function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), EXPIRY_CHECK_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}

// 描いているページの、全部のアノテーション。期限の過ぎた物は、常駐が消すまでの間も出さない（この窓で利用者が直している物は出す）
export function useAnnotationsIn(): readonly Annotation[] {
  const catalog = useCoreCatalog()
  const page = usePage()?.id ?? null
  const all = useMatomezuState(s => (page && s.annotations[page]) || NONE)
  const settings = useMatomezuState(s => s.settings)
  const locked = useMatomezuState(
    useShallow(s => Object.values(s.editLocks).flatMap(l => ("within" in l && l.within === page ? l.ids : []))),
  )
  const now = useNow()
  return useMemo(() => unexpired(catalog, all, settings, now, new Set(locked)), [catalog, all, settings, now, locked])
}

// 描いている場所のブックの、ページごとのアノテーション（ページの id → 並び。1 つも無いページは持たない）。期限の過ぎた物は、常駐が消すまでの間も出さない（この窓で利用者が直している物は出す）
export function useBookAnnotations(): Annotations {
  const catalog = useCoreCatalog()
  const book = useBook()
  const all = useMatomezuState(s => s.annotations)
  const settings = useMatomezuState(s => s.settings)
  const locks = useMatomezuState(s => s.editLocks)
  const now = useNow()
  return useMemo(() => {
    const out: Record<string, readonly Annotation[]> = {}
    for (const p of book ? pagesOf(book) : []) {
      const list = all[p.id]
      if (!list) continue
      const locked = Object.values(locks).flatMap(l => ("within" in l && l.within === p.id ? l.ids : []))
      const live = unexpired(catalog, list, settings, now, new Set(locked))
      if (live.length > 0) out[p.id] = live
    }
    return out
  }, [catalog, book, all, settings, now, locks])
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
  const drawn = usePage()?.id ?? ""
  return (action, args, page) => {
    const done = perform(action, args, { page: page ?? drawn })
    if (done.ok) return (done.result as object | undefined) ?? {}
    showToast({ kind: "warn", message: refusalMessage(catalog, done as never, refused) })
    return false
  }
}
