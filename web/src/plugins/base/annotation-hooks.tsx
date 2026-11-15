// アノテーションのレイヤー（伝言・マーク）が共通に使うフック
import { useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { type Annotation, unexpired } from "../../core/annotation"
import { useMatomezuState } from "../../ui/store-context"
import { useActions, useCoreCatalog, usePerform } from "../../ui/view-hooks"
import { useBookOf } from "./item-parts/parts"
import { kit } from "./kit"
import { refusalMessage } from "./utils/refusal"

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

// 描いている場所のブックの、全部のアノテーション。期限の過ぎた物は、常駐が消すまでの間も出さない（この窓で利用者が直している物は出す）
export function useAnnotationsIn(): readonly Annotation[] {
  const catalog = useCoreCatalog()
  const book = useBookOf() ?? null
  const all = useMatomezuState(s => (book && s.annotations[book]) || NONE)
  const settings = useMatomezuState(s => s.settings)
  const locked = useMatomezuState(
    useShallow(s => Object.values(s.editLocks).flatMap(l => ("book" in l && l.book === book ? l.ids : []))),
  )
  const now = useNow()
  return useMemo(() => unexpired(catalog, all, settings, now, new Set(locked)), [catalog, all, settings, now, locked])
}

// 描いている場所のブックの、種類 annotation のアノテーション
export function useAnnotationsOf(annotation: string): readonly Annotation[] {
  const all = useAnnotationsIn()
  return useMemo(() => all.filter(a => a.annotation === annotation), [all, annotation])
}

// アクションを行う関数: 行えたら結果（無ければ {}）、断られたら断りをトーストに出して false を返す。refused は断りの理由が無いときの文言
export function usePerformOrToast(
  refused: Parameters<typeof kit.message>[0],
): (action: string, args: unknown) => false | object {
  const perform = usePerform() as (action: string, args: unknown) => { ok: boolean; result?: unknown }
  const catalog = useCoreCatalog()
  const { showToast } = useActions()
  return (action, args) => {
    const done = perform(action, args)
    if (done.ok) return (done.result as object | undefined) ?? {}
    showToast({ kind: "warn", message: refusalMessage(catalog, done as never, kit.message(refused)) })
    return false
  }
}
