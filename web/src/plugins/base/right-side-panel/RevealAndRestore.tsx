// 右サイドパネルで開いた物を見せ、閉じたら見え方を戻す（窓に 1 つで、右サイドパネルの入れ物と並べて置く。描く物は無い）。
// 開いて幅を動かし終えたら（同じステージで開き直したときは、すぐ）、付いた先を真ん中へ見せる（1 つなら倍率 100%、いくつかなら全部が入る倍率。reveal.ts）。付いた先かカレントが替わるたびに見せ直す。物を囲むビューが Revealable を名乗り出ていれば、先にそれに見えるようにと頼む（リストの中のスクロールなど。これは戻さない）。
// 開いている間と、閉じて幅を動かしている間に倍率かずらす量を変えたかを覚えておき、閉じて幅を動かし終えたら、変えていなければ開く前の見え方に戻す（覚え方は state.ts）。
// 別のステージで開き直したときは、前のステージは戻さない。表示領域の大きさが変わってずらす量が収め直されただけなら、変えたことにはしない
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import type { Rect } from "../../../core/geom"
import type { Stage } from "../../../core/stage"
import { screenOf, stageIn } from "../../../core/window"
import { pluginValueOf } from "../../../store/plugin-state"
import { usePluginStateAt, useReadPluginStateAt, useUpdatePluginStateAt } from "../../../ui/at-hooks"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { anchorElementIn, revealedRect } from "../utils/anchors"
import { stageElement } from "../utils/stage-element"
import { moveView } from "../zoom"
import { useOpenedRightSidePanel } from "./hooks"
import { paperRectOf, revealView } from "./reveal"
import { movedFrom, RIGHT_SIDE_PANEL_RESTORE_STATE, restoreTo, revealFor, withRestore } from "./state"

export function RevealAndRestore({ sliding }: { sliding: boolean }) {
  const found = useOpenedRightSidePanel()
  const stage = found?.stage ?? null
  const anchors = found?.open.anchors ?? null
  const current = found?.open.current ?? null
  const restore = usePluginStateAt(kit, RIGHT_SIDE_PANEL_RESTORE_STATE, stage)
  const kept = useMatomezuState(
    useShallow(s =>
      screenOf(s.window)
        .stages.map(st => st.id)
        .filter(id => pluginValueOf(s.pluginValues, id, RIGHT_SIDE_PANEL_RESTORE_STATE)),
    ),
  )
  // 戻すための覚えを持つステージ（開いているステージと、閉じて幅を動かしているステージ）
  const watched = useMatomezuState(
    useShallow(s =>
      screenOf(s.window).stages.filter(st => pluginValueOf(s.pluginValues, st.id, RIGHT_SIDE_PANEL_RESTORE_STATE)),
    ),
  )
  const read = useReadState()
  const readRestore = useReadPluginStateAt(kit, RIGHT_SIDE_PANEL_RESTORE_STATE)
  const update = useUpdatePluginStateAt(kit, RIGHT_SIDE_PANEL_RESTORE_STATE)
  const actions = useStoreActions()
  const stageOf = useCallback((id: string) => stageIn(read().window, id), [read])
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
  // 見せたあと、倍率かずらす量を変えたら覚える（閉じて幅を動かしている間も。閉じたステージは stage でなくなるので、覚えを持つステージを全部見る）
  useEffect(() => {
    for (const now of watched) {
      const record = readRestore(now.id)
      if (record && !record.moved && movedFrom(record, now, now.id !== stage))
        update(now.id, r => withRestore(r, { moved: true }))
    }
  }, [watched, stage, readRestore, update])
  // 閉じて幅を動かし終えたら、戻して覚えを消す（別のステージで開いていれば、戻さずに消す）
  useEffect(() => {
    if (sliding) return
    for (const id of kept) {
      if (id === stage) continue
      const now = stageOf(id)
      const record = readRestore(id)
      const to = now && record ? restoreTo(record, now, stage !== null) : null
      if (now && to) moveView(actions, now, to)
      update(id, () => undefined)
    }
  }, [sliding, kept, stage, stageOf, readRestore, actions, update])
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
