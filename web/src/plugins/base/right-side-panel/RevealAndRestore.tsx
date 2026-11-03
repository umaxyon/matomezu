// 右サイドパネルで開いた物を見せ、閉じたら見え方を戻す（窓に 1 つで、右サイドパネルの入れ物と並べて置く。描く物は無い）。
// 開いて幅を動かし終えたら（同じステージで開き直したときは、すぐ）、倍率を 100% にして物が見えるまでずらす（reveal.ts）。物がリストなどの中のスクロールの奥にあれば、そのスクロールも動かす（これは戻さない）。
// 開いている間に倍率かずらす量を変えたかを覚えておき、閉じて幅を動かし終えたら、変えていなければ開く前の見え方に戻す（覚え方は state.ts）。
// 別のステージで開き直したときは、前のステージは戻さない。閉じたあと窓の大きさを変えてずらす量が収め直されても、変えたことにはしない
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import type { Rect } from "../../../core/geom"
import { type Stage, toPaper, toPaperDelta } from "../../../core/stage"
import { useActions, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useSetStageState, useStage, useStagePan } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorElementIn } from "../utils/anchors"
import { moveView } from "../zoom"
import { useOpenedRightSidePanel } from "./hooks"
import { revealView } from "./reveal"
import { movedFrom, restoreIn, restoreTo, withoutRestore, withRestore } from "./state"

export function RevealAndRestore({ sliding }: { sliding: boolean }) {
  const found = useOpenedRightSidePanel()
  const stage = found?.stage ?? null
  const anchor = found?.open.anchor ?? null
  const restore = useMatomezuState(s => (stage ? restoreIn(s.stageStates[stage]?.[kit.id]) : null))
  const kept = useMatomezuState(
    useShallow(s => s.workspace.stages.map(st => st.id).filter(id => restoreIn(s.stageStates[id]?.[kit.id]))),
  )
  const zoom = useStage(stage ?? "")?.zoom
  const pan = useStagePan(stage ?? "")
  const read = useReadState()
  const set = useSetStageState(kit)
  const actions = useActions()
  const update = useCallback(
    (id: string, change: (now: unknown) => unknown) => set(id, change(read().stageStates[id]?.[kit.id])),
    [read, set],
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
    if (!stage || !restore || restore.moved || zoom === undefined || !pan) return
    if (movedFrom(restore, { zoom, pan })) update(stage, now => withRestore(now, { moved: true }))
  }, [stage, restore, zoom, pan, update])
  // 閉じて幅を動かし終えたら、戻して覚えを消す（別のステージで開いていれば、戻さずに消す）
  useEffect(() => {
    if (sliding) return
    for (const id of kept) {
      if (id === stage) continue
      const now = stageOf(id)
      const record = restoreIn(read().stageStates[id]?.[kit.id])
      const to = now && record && stage === null ? restoreTo(record, now) : null
      if (now && to) moveView(actions, now, to)
      update(id, withoutRestore)
    }
  }, [sliding, kept, stage, stageOf, read, actions, update])
  return null
}

// ステージ stage の、アンカー anchor の物の四角（紙の上で。描かれていなければ null）。先に、物を中のスクロールの見える所へ動かす
function anchorRect(stage: string, anchor: string, now: Stage): Rect | null {
  const found = anchorElementIn(stage, anchor)
  if (!found) return null
  scrollInside(found.el, found.view)
  const base = found.view.getBoundingClientRect()
  const r = found.el.getBoundingClientRect()
  const at = toPaper(now, { x: r.left - base.left, y: r.top - base.top })
  if (!at) return null
  const size = toPaperDelta(now, { x: r.width, y: r.height })
  return { x: at.x, y: at.y, w: size.x, h: size.y }
}

// 要素 el を、ステージの表示領域 view までの間のスクロールする要素の中で、見える所へ動かす（入りきらなければ左上を見せる）
function scrollInside(el: Element, view: Element) {
  for (let box = el.parentElement; box && box !== view; box = box.parentElement) {
    const style = getComputedStyle(box)
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    // 倍率をかけた画面の上の長さを、スクロールの長さに直す
    const k = box.offsetHeight > 0 ? b.height / box.offsetHeight : 1
    if (scrolls(style.overflowY) && box.scrollHeight > box.clientHeight)
      box.scrollTop += scrollBy(r.top - b.top, r.height, box.clientHeight * k) / k
    if (scrolls(style.overflowX) && box.scrollWidth > box.clientWidth)
      box.scrollLeft += scrollBy(r.left - b.left, r.width, box.clientWidth * k) / k
  }
}

const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll"

// 中のスクロールの見える長さ seen の中で、start から size の物を見せるのに動かす量（入りきらないか前にはみ出せば始まりに、後ろにはみ出せば終わりにそろえる）
function scrollBy(start: number, size: number, seen: number): number {
  if (start < 0 || size > seen) return start
  if (start + size > seen) return start + size - seen
  return 0
}
