// 右サイドパネルで開いた物を見せ、閉じたら見え方を戻す（窓に 1 つで、右サイドパネルの入れ物と並べて置く。描く物は無い）。
// 開いて幅を動かし終えたら（同じステージで開き直したときは、すぐ）、付いた先を真ん中へ見せる（1 つなら倍率 100%、いくつかなら全部が入る倍率。reveal.ts）。付いた先かカレントが替わるたびに見せ直す。物を囲むビューが Revealable を名乗り出ていれば、先にそれに見えるようにと頼む（リストの中のスクロールなど。これは戻さない）。
// 開いている間に倍率かずらす量を変えたかを覚えておき、閉じて幅を動かし終えたら、変えていなければ開く前の見え方に戻す（覚え方は state.ts）。
// 別のステージで開き直したときは、前のステージは戻さない。表示領域の大きさが変わってずらす量が収め直されただけなら、変えたことにはしない
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import type { Rect } from "../../../core/geom"
import type { Stage } from "../../../core/stage"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorElementIn, revealedRect } from "../utils/anchors"
import { stageElement } from "../utils/stage-element"
import { moveView } from "../zoom"
import { useOpenedRightSidePanel } from "./hooks"
import { paperRectOf, revealView } from "./reveal"
import { movedFrom, restoreIn, restoreTo, revealFor, withoutRestore, withRestore } from "./state"

export function RevealAndRestore({ sliding }: { sliding: boolean }) {
  const found = useOpenedRightSidePanel()
  const stage = found?.stage ?? null
  const anchors = found?.open.anchors ?? null
  const current = found?.open.current ?? null
  const restore = restoreIn(useStageState(stage ?? "", kit))
  const kept = useMatomezuState(
    useShallow(s => s.workspace.stages.map(st => st.id).filter(id => restoreIn(s.stageStates[id]?.[kit.id]))),
  )
  const now = useMatomezuState(s => (stage ? s.workspace.stages.find(st => st.id === stage) : undefined))
  const read = useReadState()
  const readOwn = useReadStageState(kit)
  const set = useSetStageState(kit)
  const actions = useActions()
  const update = useCallback(
    (id: string, change: (now: unknown) => unknown) => set(id, change(readOwn(id))),
    [readOwn, set],
  )
  const stageOf = useCallback((id: string) => read().workspace.stages.find(s => s.id === id), [read])
  // 見せる: 付いた先が替われば全部を囲む四角を収め（1 つなら 100%）、カレントだけが替われば倍率はそのままでカレントを真ん中へ（state.ts の revealFor）
  useEffect(() => {
    if (sliding || !stage || anchors === null || current === null || !restore) return
    const how = revealFor(restore.seen, { anchors, current })
    if (how === "none") return
    const before = stageOf(stage)
    if (!before) return
    const rect = anchorsRect(stage, how === "anchors" ? anchors : [current], before)
    const zoom = how === "current" ? "keep" : anchors.length > 1 ? "fit" : "actual"
    if (rect) moveView(actions, before, revealView(before, rect, zoom))
    const after = stageOf(stage) ?? before
    update(stage, now => withRestore(now, { shown: { zoom: after.zoom, pan: after.pan }, seen: { anchors, current } }))
  }, [sliding, stage, anchors, current, restore, stageOf, actions, update])
  // 見せたあと、倍率かずらす量を変えたら覚える
  useEffect(() => {
    if (!stage || !restore || restore.moved || !now) return
    if (movedFrom(restore, now)) update(stage, state => withRestore(state, { moved: true }))
  }, [stage, restore, now, update])
  // 閉じて幅を動かし終えたら、戻して覚えを消す（別のステージで開いていれば、戻さずに消す）
  useEffect(() => {
    if (sliding) return
    for (const id of kept) {
      if (id === stage) continue
      const now = stageOf(id)
      const record = restoreIn(readOwn(id))
      const to = now && record ? restoreTo(record, now, stage !== null) : null
      if (now && to) moveView(actions, now, to)
      update(id, withoutRestore)
    }
  }, [sliding, kept, stage, stageOf, readOwn, actions, update])
  return null
}

// ステージ stage の、アンカー ids の物をまとめて囲む四角（紙の上で。どれも描かれていなければ null）。先に、物を囲む Revealable に見えるようにと頼む（リストの中のスクロールなど）
function anchorsRect(stage: string, ids: readonly string[], now: Stage): Rect | null {
  const view = stageElement(stage)
  if (!view) return null
  const found = ids.flatMap(id => {
    const el = anchorElementIn(stage, id)?.el
    return el ? [{ el, id }] : []
  })
  const rect = revealedRect(view, view, found)
  return rect && paperRectOf(now, rect)
}
