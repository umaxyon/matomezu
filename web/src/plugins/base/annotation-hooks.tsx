// アノテーションのレイヤー（伝言・マーク）が共通に使うフック
import { useMemo } from "react"
import type { Annotation } from "../../core/annotation"
import { useActions, useMatomezuState } from "../../ui/store-context"
import { useCoreCatalog, usePerform } from "../../ui/view-hooks"
import { kit } from "./kit"
import { refusalMessage } from "./utils/refusal"

const NONE: readonly Annotation[] = []

// ステージで開いているブックの、種類 annotation のアノテーション
export function useAnnotationsOf(stage: string, annotation: string): readonly Annotation[] {
  const all = useMatomezuState(s => {
    const book = s.workspace.stages.find(st => st.id === stage)?.opened?.book
    return (book && s.annotations[book]) || NONE
  })
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
