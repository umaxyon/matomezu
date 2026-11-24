// スクリーンを上下に分けて並べる操作（SPLIT_ROWS）。描いている場所のスクリーン（スクリーンの外ならカレントスクリーン）を起点にし、ほかのスクリーンを id で名指さない。
// 並びから外れたスクリーンは、ここで閉じる（開く側は閉じない）。窓が低い（SPLIT_MIN_HEIGHT 未満）ときは、分けずに 1 枚で開く

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useShallow } from "zustand/react/shallow"
import { NO_STATE } from "../../../core/def/plugin-state"
import { sameData } from "../../../core/same"
import { currentScreen, recentPlainScreen, type WindowState } from "../../../core/window"
import { SCREEN_REFUSED } from "../../../store/actions"
import { useUpdatePluginState } from "../../../ui/plugin-state-hooks"
import { NO_SCREEN, useScreenContext } from "../../../ui/screen-context"
import { useMatomezuState, useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { applySplitFrom, showBookSplit } from "./apply-split"
import {
  planAt,
  planClose,
  planCloseAll,
  planExpand,
  planOpen,
  SCREEN_FLASH,
  SPLIT_ROWS,
  type SplitPlan,
  shownSplit,
  splitOf,
  wideOf,
  withWide,
} from "./split"
import { subscribeTall, tallNow } from "./tall"

// 窓が、分けて並べられる高さか
export const useTallEnough = (): boolean => useSyncExternalStore(subscribeTall, tallNow, () => false)

// 並びを覚えたまま窓いっぱいに広げているスクリーン（広げていなければ undefined）
export const wideIn = (win: WindowState): string | undefined =>
  win.arrangement === SPLIT_ROWS.id
    ? wideOf(splitOf(win.screens, win.arrangementValue), win.arrangementValue)
    : undefined

// 分けて見せている並び（分けて見せていなければ空）
export const splitIn = (win: WindowState): readonly string[] =>
  shownSplit(win.screens, win.order, { id: win.arrangement, value: win.arrangementValue })

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
  // ブック book（page を名指せばそのページ）を窓に出し、出したブックスクリーンを、分けられるなら起点を基に並びに入れる（max 枚まで。入れ方は showBookSplit・bookSplitWay）。
  // 窓が低ければ、分けずに窓いっぱいに出す
  showBook(book: string, page: string | undefined, keepHere: boolean, max: number): void
  count: number // 分けて並べている枚数（分けていなければ 0）
  defs: readonly string[] // 分けて並べているスクリーンの定義の id（上から。分けていなければ空）
  close(): void // 起点のスクリーンを閉じる（並びが 1 枚になれば、残った物を窓いっぱいに見せる）
  closeOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンを閉じる
  showOf<P>(def: { id: string }, props: P): void // 分けた並びの、定義 def・渡す値 props のスクリーンをカレントスクリーンにし、枠を一瞬光らせる
  expand(): void // 起点のスクリーンだけを 1 枚で見せる（並びのほかの物は開いたまま見えなくなる）
  wide: boolean // 起点のスクリーンを、並びを覚えたまま窓いっぱいに広げているか
  widen(): void // 起点のスクリーンを、並びを覚えたまま窓いっぱいに広げる（ブックスクリーンの下の行の □）
  unwiden(): void // 広げていた並びに戻す
  rowsShown: boolean // 起点のスクリーンを、後ろのステージを並べないスクリーン（コントロールセンターなど）と上下に分けられるか（分けていない・広げていない・窓が高い）
  toRows(): void // 後ろのステージを並べないスクリーンを上、起点のスクリーンを下に分ける（最初から窓いっぱいに開いたブックスクリーンの下の行の □）
  expandCurrent(): void // カレントスクリーンだけを 1 枚で見せる（並びの物は開いたまま見えなくなる。並びの中から、ブックを全画面で開いたあと）
  closeAll(): void // 分けて並べている物を全部閉じて、1 枚ずつに戻す（閉じられない物は残る）
}

export function useScreenSplit(): ScreenSplit {
  const inside = useScreenContext()
  // 窓の全部は、操作するときに読む（描き直すのは、分けた並びと、それに入っている物・起点が変わったときだけ）
  const read = useReadState()
  const currentId = useMatomezuState(s => currentScreen(s.window).id)
  const currentDef = useMatomezuState(s => currentScreen(s.window).def)
  const split = useMatomezuState(useShallow(s => splitIn(s.window)))
  const wideHere = useMatomezuState(
    s => wideIn(s.window) === (inside !== NO_SCREEN ? inside.id : currentScreen(s.window).id),
  )
  const behindHere = useMatomezuState(s => recentPlainScreen(s.window)?.id)
  const members = useMatomezuState(useShallow(s => split.map(id => s.window.screens.find(x => x.id === id) ?? null)))
  const tall = useTallEnough()
  const actions = useStoreActions()
  const flash = useUpdatePluginState(kit, SCREEN_FLASH)
  const here = inside !== NO_SCREEN ? { id: inside.id, def: inside.def } : { id: currentId, def: currentDef }
  const shownHere = useMemo(() => ({ def: here.def }), [here.def])
  const apply = useCallback((plan: SplitPlan) => applySplitFrom(actions, plan), [actions])
  const find = useCallback(
    (def: { id: string }, props: unknown) =>
      members.find(s => s !== null && s.def === def.id && sameData(s.props, props))?.id,
    [members],
  )
  const closeOne = useCallback(
    (id: string) => {
      if (!split.includes(id)) return actions.closeScreen(id)
      apply(planClose(split, id))
    },
    [actions, apply, split],
  )
  return {
    here: shownHere,
    inSplit: split.includes(here.id),
    index: split.indexOf(here.id),
    tall,
    has: (def, props) => find(def, props) !== undefined,
    count: split.length,
    defs: members.flatMap(s => (s ? [s.def] : [])),
    closeAll: () => apply(planCloseAll(split)),
    openAt: ({ def, props }, index) => {
      const added = actions.openScreenId(def.id, props)
      if (added !== SCREEN_REFUSED && split.length > 0) apply(planAt(split, index, added))
    },
    open: ({ def, props }, how, max) => {
      const added = actions.openScreenId(def.id, props)
      if (added !== SCREEN_REFUSED && tallNow()) apply(planOpen(split, here.id, added, how, max))
    },
    showBook: (book, page, keepHere, max) =>
      showBookSplit({
        actions,
        readWindow: () => read().window,
        here: here.id,
        keepHere,
        max,
        tall: tallNow(),
        flash: screen => flash(was => ({ screen, n: (was === NO_STATE ? 0 : was.n) + 1 })),
        book,
        page,
      }),
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
    expand: () => apply(planExpand(here.id)),
    wide: wideHere,
    widen: () => {
      actions.setScreenArrangement(SPLIT_ROWS.id, withWide(read().window.arrangementValue, here.id))
      actions.makeScreenCurrent(here.id)
    },
    unwiden: () => {
      actions.setScreenArrangement(SPLIT_ROWS.id, withWide(read().window.arrangementValue, undefined))
      actions.makeScreenCurrent(here.id)
    },
    rowsShown: tall && !split.includes(here.id) && !wideHere && behindHere !== undefined && behindHere !== here.id,
    toRows: () => {
      if (behindHere === undefined || !tallNow()) return
      apply(planOpen([], here.id, behindHere, "before", 2))
      actions.makeScreenCurrent(here.id)
    },
    expandCurrent: () => apply(planExpand(currentScreen(read().window).id)),
  }
}
