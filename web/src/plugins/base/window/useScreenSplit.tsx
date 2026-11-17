// スクリーンを上下に分けて並べる操作（SPLIT_ROWS）。描いている場所のスクリーン（スクリーンの外ならカレントスクリーン）を起点にし、ほかのスクリーンを id で名指さない。
// 並びから外れたスクリーンは、ここで閉じる（開く側は閉じない）。窓が低い（SPLIT_MIN_HEIGHT 未満）ときは、分けずに 1 枚で開く
import { useCallback, useSyncExternalStore } from "react"
import { useShallow } from "zustand/react/shallow"
import { sameData } from "../../../core/same"
import { currentScreen, type WindowState } from "../../../core/window"
import { type Actions, type MatomezuState, SCREEN_REFUSED } from "../../../store/store"
import { useScreenContext } from "../../../ui/screen-context"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { ONE_SCREEN } from "."
import {
  behindOf,
  planAt,
  planClose,
  planExpand,
  planOpen,
  SPLIT_MIN_HEIGHT,
  SPLIT_ROWS,
  type SplitPlan,
  shownSplit,
} from "./split"

const TALL = `(min-height: ${SPLIT_MIN_HEIGHT}px)`
const subscribeTall = (changed: () => void) => {
  if (typeof matchMedia !== "function") return () => {}
  const query = matchMedia(TALL)
  query.addEventListener("change", changed)
  return () => query.removeEventListener("change", changed)
}
const tallNow = () => typeof matchMedia === "function" && matchMedia(TALL).matches

// 窓が、分けて並べられる高さか
export const useTallEnough = (): boolean => useSyncExternalStore(subscribeTall, tallNow, () => false)

// 分けて見せている並び（分けて見せていなければ空）
export const splitIn = (win: WindowState): readonly string[] =>
  shownSplit(win.screens, win.order, { id: win.arrangement, value: win.arrangementValue })

// 並びの変わりを行う: 外れた物を閉じ、閉じられずに開いたままの物は behind に覚える（あとで並びが 1 枚になったら戻す）。
// 並びが 2 枚に満たなければ 1 枚ずつに戻す
export function applySplit(
  actions: Pick<Actions, "closeScreen" | "setScreenArrangement">,
  read: () => Pick<MatomezuState, "window">,
  plan: SplitPlan,
): void {
  const before = read().window
  const was = before.arrangement === SPLIT_ROWS.id ? behindOf(before.screens, before.arrangementValue) : []
  for (const id of plan.leaving) actions.closeScreen(id)
  const open = read().window.screens
  const kept = plan.leaving.filter(id => open.some(s => s.id === id))
  const behind = [...kept, ...was].filter(
    (id, i, list) => list.indexOf(id) === i && !plan.screens.includes(id) && open.some(s => s.id === id),
  )
  if (plan.screens.length >= 2) actions.setScreenArrangement(SPLIT_ROWS.id, { screens: plan.screens, behind })
  else actions.setScreenArrangement(ONE_SCREEN.id)
}

// 開く物（スクリーンの定義と渡す値）
interface Opening<P> {
  def: { id: string; props: { safeParse(value: unknown): { success: boolean } } }
  props: P
}

export interface ScreenSplit {
  here: { id: string; def: string } // 起点のスクリーン（描いている場所のスクリーン。スクリーンの外ならカレントスクリーン）
  inSplit: boolean // 起点のスクリーンを分けて並べているか
  index: number // 並びの中の位置（上から 0。並べていなければ -1）
  tall: boolean // 窓が、分けて並べられる高さか
  // 定義 def・渡す値 props のスクリーンが、分けた並びにあるか
  has<P>(def: { id: string }, props: P): boolean
  // 開く: 分けられるなら起点の後ろ・前・代わりに入れ（max 枚まで）、分けられなければ 1 枚で開く
  open<P>(opening: Opening<P>, how: "after" | "before" | "in-place", max: number): void
  // 分けた並びの index 番目（上から）を、開いたスクリーンに替える（分けていなければ、1 枚で開く）
  openAt<P>(opening: Opening<P>, index: number): void
  count: number // 分けて並べている枚数（分けていなければ 0）
  close(): void // 起点のスクリーンを閉じる（並びが 1 枚になれば、並びから外していた物を上に戻す）
  closeOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンを閉じる
  showOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンをカレントスクリーンにする
  expand(): void // 起点のスクリーンだけを 1 枚で見せ、並びのほかの物は閉じる
}

export function useScreenSplit(): ScreenSplit {
  const inside = useScreenContext()
  // 窓の全部は、操作するときに読む（描き直すのは、分けた並びと、それに入っている物・起点が変わったときだけ）
  const read = useReadState()
  const current = useMatomezuState(s => currentScreen(s.window))
  const split = useMatomezuState(useShallow(s => splitIn(s.window)))
  const members = useMatomezuState(useShallow(s => split.map(id => s.window.screens.find(x => x.id === id) ?? null)))
  const tall = useTallEnough()
  const actions = useStoreActions()
  const here = inside ? { id: inside.id, def: inside.def } : { id: current.id, def: current.def }
  const apply = useCallback((plan: SplitPlan) => applySplit(actions, read, plan), [actions, read])
  const find = useCallback(
    (def: { id: string }, props: unknown) =>
      members.find(s => s !== null && s.def === def.id && sameData(s.props, props))?.id,
    [members],
  )
  const closeOne = useCallback(
    (id: string) => {
      if (!split.includes(id)) return actions.closeScreen(id)
      const win = read().window
      apply(planClose(split, behindOf(win.screens, win.arrangementValue), id))
    },
    [actions, apply, split, read],
  )
  return {
    here,
    inSplit: split.includes(here.id),
    index: split.indexOf(here.id),
    tall,
    has: (def, props) => find(def, props) !== undefined,
    count: split.length,
    openAt: ({ def, props }, index) => {
      const added = actions.openScreen(def.id, props)
      if (added !== SCREEN_REFUSED && split.length > 0) apply(planAt(split, index, added))
    },
    open: ({ def, props }, how, max) => {
      const added = actions.openScreen(def.id, props)
      if (added !== SCREEN_REFUSED && tallNow()) apply(planOpen(split, here.id, added, how, max))
    },
    close: () => closeOne(here.id),
    closeOf: (def, props) => {
      const id = find(def, props)
      if (id !== undefined) closeOne(id)
    },
    showOf: (def, props) => {
      const id = find(def, props)
      if (id !== undefined) actions.makeScreenCurrent(id)
    },
    expand: () => {
      apply(planExpand(split, here.id))
      actions.makeScreenCurrent(here.id)
    },
  }
}
