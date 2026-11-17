// スクリーンを上下に分けて並べる操作（SPLIT_ROWS）。描いている場所のスクリーン（スクリーンの外ならカレントスクリーン）を起点にし、ほかのスクリーンを id で名指さない。
// 並びから外れたスクリーンは、ここで閉じる（開く側は閉じない）。窓が低い（SPLIT_MIN_HEIGHT 未満）ときは、分けずに 1 枚で開く
import { useCallback, useSyncExternalStore } from "react"
import { useShallow } from "zustand/react/shallow"
import { currentScreen, type WindowState } from "../../../core/window"
import { SCREEN_REFUSED } from "../../../store/store"
import { useScreenContext } from "../../../ui/screen-context"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { ONE_SCREEN } from "."
import {
  behindOf,
  planClose,
  planExpand,
  planOpen,
  SPLIT_MIN_HEIGHT,
  SPLIT_ROWS,
  type SplitPlan,
  splitOf,
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

// 分けて並べている並び（分けていなければ空）
export const splitIn = (win: WindowState): readonly string[] =>
  win.arrangement === SPLIT_ROWS.id ? splitOf(win.screens, win.arrangementValue) : []

// 開く物（スクリーンの定義と渡す値）
interface Opening<P> {
  def: { id: string; props: { safeParse(value: unknown): { success: boolean } } }
  props: P
}

export interface ScreenSplit {
  inSplit: boolean // 起点のスクリーンを分けて並べているか
  index: number // 並びの中の位置（上から 0。並べていなければ -1）
  tall: boolean // 窓が、分けて並べられる高さか
  // 定義 def・渡す値 props のスクリーンが、分けた並びにあるか
  has<P>(def: { id: string }, props: P): boolean
  // 開く: 分けられるなら起点の後ろ・前・代わりに入れ（max 枚まで）、分けられなければ 1 枚で開く
  open<P>(opening: Opening<P>, how: "after" | "before" | "in-place", max: number): void
  close(): void // 起点のスクリーンを閉じる（並びが 1 枚になれば、並びに無かった同じ種類の物を上に戻す）
  closeOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンを閉じる
  expand(): void // 起点のスクリーンだけを 1 枚で見せ、並びのほかの物は閉じる
}

export function useScreenSplit(): ScreenSplit {
  const here = useScreenContext()
  // 窓の全部は、操作するときに読む（描き直すのは、分けた並びと、それに入っている物の定義・渡す値が変わったときだけ）
  const read = useReadState()
  const current = useMatomezuState(s => currentScreen(s.window).id)
  const split = useMatomezuState(useShallow(s => splitIn(s.window)))
  const members = useMatomezuState(
    useShallow(s =>
      split
        .map(id => s.window.screens.find(x => x.id === id))
        .map(x => (x ? `${x.def} ${JSON.stringify(x.props)}` : "")),
    ),
  )
  const tall = useTallEnough()
  const actions = useStoreActions()
  const self = here?.id ?? current
  // 並びの変わりを行う: 外れた物を閉じ、閉じられずに開いたままの物は behind に覚える（あとで並びが 1 枚になったら戻す）
  const apply = useCallback(
    (plan: SplitPlan, options?: { history: "replace" }) => {
      const before = read().window
      const was = before.arrangement === SPLIT_ROWS.id ? behindOf(before.screens, before.arrangementValue) : []
      for (const id of plan.leaving) actions.closeScreen(id)
      const open = read().window.screens
      const kept = plan.leaving.filter(id => open.some(s => s.id === id))
      const behind = [...kept, ...was].filter(
        (id, i, list) => list.indexOf(id) === i && !plan.screens.includes(id) && open.some(s => s.id === id),
      )
      if (plan.screens.length >= 2)
        actions.setScreenArrangement(SPLIT_ROWS.id, { screens: plan.screens, behind }, options)
      else actions.setScreenArrangement(ONE_SCREEN.id, undefined, options)
    },
    [actions, read],
  )
  const find = useCallback(
    (def: { id: string }, props: unknown) => split[members.indexOf(`${def.id} ${JSON.stringify(props)}`)],
    [split, members],
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
    inSplit: split.includes(self),
    index: split.indexOf(self),
    tall,
    has: (def, props) => find(def, props) !== undefined,
    open: ({ def, props }, how, max) => {
      const added = actions.openScreen(def.id, props)
      if (added !== SCREEN_REFUSED && tallNow()) apply(planOpen(split, self, added, how, max))
    },
    close: () => closeOne(self),
    closeOf: (def, props) => {
      const id = find(def, props)
      if (id !== undefined) closeOne(id)
    },
    expand: () => {
      apply(planExpand(split, self), { history: "replace" })
      actions.makeScreenCurrent(self)
    },
  }
}
