// 右サイドパネルで開いた物を見せ、閉じたら見え方を戻す（窓に 1 つで、右サイドパネルの入れ物と並べて置く。描く物は無い）。
// 開いて幅を動かし終えたら（同じステージで開き直したときは、すぐ）、倍率を 100% にして物が見えるまでずらす（reveal.ts）。物がリストなどの中のスクロールの奥にあれば、そのスクロールも動かす（これは戻さない）。
// 開いている間に倍率かずらす量を変えたかを覚えておき、閉じて幅を動かし終えたら、変えていなければ開く前の見え方に戻す（覚え方は state.ts）。
// 別のステージで開き直したときは、前のステージは戻さない。表示領域の大きさが変わってずらす量が収め直されただけなら、変えたことにはしない
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import type { Rect } from "../../../core/geom"
import type { Stage } from "../../../core/stage"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useReadStageState, useSetStageState, useStageState } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorElementIn } from "../utils/anchors"
import { moveView } from "../zoom"
import { useOpenedRightSidePanel } from "./hooks"
import { paperRectOf, revealView, scrollShift } from "./reveal"
import { movedFrom, restoreIn, restoreTo, withoutRestore, withRestore } from "./state"

export function RevealAndRestore({ sliding }: { sliding: boolean }) {
  const found = useOpenedRightSidePanel()
  const stage = found?.stage ?? null
  const anchor = found?.open.anchor ?? null
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
  // 見せる（まだ見せていなければ）
  useEffect(() => {
    if (sliding || !stage || anchor === null || !restore || restore.shown !== null) return
    const before = stageOf(stage)
    if (!before) return
    const rect = anchorRect(stage, anchor, before)
    if (rect) moveView(actions, before, revealView(before, rect))
    const after = stageOf(stage) ?? before
    update(stage, now => withRestore(now, { shown: { zoom: after.zoom, pan: after.pan } }))
  }, [sliding, stage, anchor, restore, stageOf, actions, update])
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

// ステージ stage の、アンカー anchor の物の四角（紙の上で。描かれていなければ null）。先に、物を中のスクロールの見える所へ動かす
function anchorRect(stage: string, anchor: string, now: Stage): Rect | null {
  const found = anchorElementIn(stage, anchor)
  if (!found) return null
  scrollInside(found.el, found.view)
  const base = found.view.getBoundingClientRect()
  const r = found.el.getBoundingClientRect()
  return paperRectOf(now, { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height })
}

// 要素 el を、ステージの表示領域 view までの間のスクロールする要素の中で、見える所へ動かす（入りきらなければ左上を見せる）
function scrollInside(el: Element, view: Element) {
  for (let box = el.parentElement; box && box !== view; box = box.parentElement) {
    const style = getComputedStyle(box)
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    const scale = box.offsetHeight > 0 ? b.height / box.offsetHeight : 1 // 画面の上の長さ ÷ スクロールの長さ
    if (scrolls(style.overflowY) && box.scrollHeight > box.clientHeight)
      box.scrollTop += scrollShift(r.top - b.top, r.height, box.clientHeight, scale)
    if (scrolls(style.overflowX) && box.scrollWidth > box.clientWidth)
      box.scrollLeft += scrollShift(r.left - b.left, r.width, box.clientWidth, scale)
  }
}

const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll"
