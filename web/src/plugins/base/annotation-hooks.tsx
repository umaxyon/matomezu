// アノテーションのレイヤー（伝言・マーク）が共通に使うフック
import { useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { type Annotation, unexpired } from "../../core/annotation"
import { useActions, useMatomezuState } from "../../ui/store-context"
import { useCoreCatalog, usePerform } from "../../ui/view-hooks"
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

// ステージで開いているブックの、全部のアノテーション。期限の過ぎた物は、常駐が消すまでの間も出さない（この窓で利用者が直している物は出す）
export function useAnnotationsIn(stage: string): readonly Annotation[] {
  const catalog = useCoreCatalog()
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book ?? null)
  const all = useMatomezuState(s => (book && s.annotations[book]) || NONE)
  const settings = useMatomezuState(s => s.settings)
  const editing = useMatomezuState(
    useShallow(s => Object.values(s.editLocks).flatMap(l => (l.book === book ? l.ids : []))),
  )
  const now = useNow()
  return useMemo(() => unexpired(catalog, all, settings, now, new Set(editing)), [catalog, all, settings, now, editing])
}

// ステージで開いているブックの、種類 annotation のアノテーション
export function useAnnotationsOf(stage: string, annotation: string): readonly Annotation[] {
  const all = useAnnotationsIn(stage)
  return useMemo(() => all.filter(a => a.annotation === annotation), [all, annotation])
}

// アクションを行う関数: 行えたら結果（無ければ {}）、断られたら断りをトーストに出して false を返す。refused は断りの理由が無いときの文言
export function usePerformOrToast(
  stage: string,
  refused: Parameters<typeof kit.message>[0],
): (action: string, args: unknown) => false | object {
  const perform = usePerform(stage) as (action: string, args: unknown) => { ok: boolean; result?: unknown }
  const catalog = useCoreCatalog()
  const { showToast } = useActions()
  return (action, args) => {
    const done = perform(action, args)
    if (done.ok) return (done.result as object | undefined) ?? {}
    showToast({ kind: "warn", message: refusalMessage(catalog, done as never, kit.message(refused)) })
    return false
  }
}
