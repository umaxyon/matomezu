// スクリーンを上下に分けて並べる操作（SPLIT_ROWS）。描いている場所のスクリーン（スクリーンの外ならカレントスクリーン）を起点にし、ほかのスクリーンを id で名指さない。
// 並びから外れたスクリーンは、ここで閉じる（開く側は閉じない）。窓が低い（SPLIT_MIN_HEIGHT 未満）ときは、分けずに 1 枚で開く

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useShallow } from "zustand/react/shallow"
import { NO_STATE } from "../../../core/def/plugin-state"
import { sameData } from "../../../core/same"
import { currentScreen, screenOfStage, type WindowState } from "../../../core/window"
import { type Actions, SCREEN_REFUSED } from "../../../store/actions"
import { NO_STAGE } from "../../../store/dialogs"
import type { MatomezuState } from "../../../store/state"
import { useUpdatePluginState } from "../../../ui/plugin-state-hooks"
import { NO_SCREEN, useScreenContext } from "../../../ui/screen-context"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { applySplitFrom } from "./apply-split"
import {
  behindOf,
  planAt,
  planClose,
  planExpand,
  planOpen,
  SCREEN_FLASH,
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

// ステージを並べるスクリーンの id（planClose に渡す）
export const stageScreensOf = (win: Pick<WindowState, "screens">): readonly string[] =>
  win.screens.filter(s => s.stages).map(s => s.id)

// 分けて見せている並び（分けて見せていなければ空）
export const splitIn = (win: WindowState): readonly string[] =>
  shownSplit(win.screens, win.order, { id: win.arrangement, value: win.arrangementValue })

// 並びの変わりを行う: 外れた物を閉じ、閉じられずに開いたままの物は behind に覚える（あとで並びが 1 枚になったら戻す）。
// ステージを並べるスクリーンは、外れても閉じず（倍率・選択などを失わない）、behind にも入れない（いつも下に敷いてある）。
// 並びが 2 枚に満たなければ 1 枚ずつに戻す
export function applySplit(
  actions: Pick<Actions, "closeScreen" | "setScreenArrangement">,
  read: () => Pick<MatomezuState, "window">,
  plan: SplitPlan,
): void {
  const before = read().window
  const value = before.arrangement === SPLIT_ROWS.id ? before.arrangementValue : undefined
  applySplitFrom(actions, before.screens, value, plan, () => read().window.screens)
}

// 開く物（スクリーンの定義と渡す値）
interface Opening<P> {
  def: { id: string; props: { safeParse(value: unknown): { success: boolean } } }
  props: P
}

export interface ScreenSplit {
  here: { def: string } // 起点のスクリーンの定義の id（起点は、描いている場所のスクリーン。スクリーンの外ならカレントスクリーン）
  inSplit: boolean // 起点のスクリーンを分けて並べているか
  index: number // 並びの中の位置（上から 0。並べていなければ -1）
  tall: boolean // 窓が、分けて並べられる高さか
  // 定義 def・渡す値 props のスクリーンが、分けた並びにあるか
  has<P>(def: { id: string }, props: P): boolean
  // 開く: 分けられるなら起点の後ろ・前・代わりに入れ（max 枚まで）、分けられなければ 1 枚で開く
  open<P>(opening: Opening<P>, how: "after" | "before" | "in-place", max: number): void
  // 分けた並びの index 番目（上から）を、開いたスクリーンに替える（分けていなければ、1 枚で開く）
  openAt<P>(opening: Opening<P>, index: number): void
  // ブック book（page を名指せばそのページ）を窓に出し（showBookStage）、出したブックスクリーンを、分けられるなら起点の後ろ・前・代わりに入れる（max 枚まで）。
  // そのブックスクリーンがもう並びに在れば、その段をカレントにして光らせる。窓に無いブックなら何もせず false
  showBook(book: string, page: string | undefined, how: "after" | "before" | "in-place", max: number): boolean
  count: number // 分けて並べている枚数（分けていなければ 0）
  defs: readonly string[] // 分けて並べているスクリーンの定義の id（上から。分けていなければ空）
  close(): void // 起点のスクリーンを閉じる（並びが 1 枚になれば、並びから外していた物を上に戻す）
  closeOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンを閉じる
  showOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンをカレントスクリーンにし、枠を一瞬光らせる
  expand(): void // 起点のスクリーンだけを 1 枚で見せ、並びのほかの物は閉じる
  closeAll(): void // 分けて並べている物を全部閉じて、1 枚ずつに戻す（閉じられない物は残る）
}

export function useScreenSplit(): ScreenSplit {
  const inside = useScreenContext()
  // 窓の全部は、操作するときに読む（描き直すのは、分けた並びと、それに入っている物・起点が変わったときだけ）
  const read = useReadState()
  const currentId = useMatomezuState(s => currentScreen(s.window).id)
  const currentDef = useMatomezuState(s => currentScreen(s.window).def)
  const split = useMatomezuState(useShallow(s => splitIn(s.window)))
  const members = useMatomezuState(useShallow(s => split.map(id => s.window.screens.find(x => x.id === id) ?? null)))
  const tall = useTallEnough()
  const actions = useStoreActions()
  const flash = useUpdatePluginState(kit, SCREEN_FLASH)
  const here = inside !== NO_SCREEN ? { id: inside.id, def: inside.def } : { id: currentId, def: currentDef }
  const shownHere = useMemo(() => ({ def: here.def }), [here.def])
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
      apply(planClose(split, behindOf(win.screens, win.arrangementValue), id, stageScreensOf(win)))
    },
    [actions, apply, split, read],
  )
  return {
    here: shownHere,
    inSplit: split.includes(here.id),
    index: split.indexOf(here.id),
    tall,
    has: (def, props) => find(def, props) !== undefined,
    count: split.length,
    defs: members.flatMap(s => (s ? [s.def] : [])),
    closeAll: () => apply({ screens: [], leaving: split }),
    openAt: ({ def, props }, index) => {
      const added = actions.openScreenId(def.id, props)
      if (added !== SCREEN_REFUSED && split.length > 0) apply(planAt(split, index, added))
    },
    open: ({ def, props }, how, max) => {
      const added = actions.openScreenId(def.id, props)
      if (added !== SCREEN_REFUSED && tallNow()) apply(planOpen(split, here.id, added, how, max))
    },
    showBook: (book, page, how, max) => {
      // 出したブックスクリーンがカレントになると、並びに入る前は「分けて見せていない」と読めるので、並びは出す前の物を使う
      const before = splitIn(read().window)
      const stage = actions.showBookStage(book, page)
      if (stage === NO_STAGE) return false
      // 出すときに上限を超えたブックスクリーンが閉じることがあるので、出したあとの窓に残っている物だけにする
      const win = read().window
      const added = screenOfStage(win, stage)?.id
      const now = before.filter(id => win.screens.some(s => s.id === id))
      if (added === undefined || !tallNow()) return true
      if (now.includes(added)) {
        flash(was => ({ screen: added, n: (was === NO_STATE ? 0 : was.n) + 1 }))
        return true
      }
      apply(planOpen(now, here.id, added, how, max))
      return true
    },
    close: () => closeOne(here.id),
    closeOf: (def, props) => {
      const id = find(def, props)
      if (id !== undefined) closeOne(id)
    },
    showOf: (def, props) => {
      const id = find(def, props)
      if (id === undefined) return
      actions.makeScreenCurrent(id)
      flash(was => ({ screen: id, n: (was === NO_STATE ? 0 : was.n) + 1 }))
    },
    expand: () => {
      apply(planExpand(split, here.id))
      actions.makeScreenCurrent(here.id)
    },
  }
}
