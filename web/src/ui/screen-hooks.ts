// プラグインの見た目が使う、スクリーンとブラウザの履歴のフック（matomezu/ui）: 描いている場所のスクリーン・スクリーンを開く閉じる・
// スクリーンアレンジメントと、それが並べるスクリーン・ブラウザの履歴

import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { fail } from "../core/errors"
import { currentScreen, shownScreens } from "../core/window"
import { useArranged } from "./arranged-context"
import { NO_SCREEN, useScreenContext, useScreenIdHere } from "./screen-context"
import { useMatomezuState, useReadState, useStoreActions } from "./store-context"
import { useCoreCatalog } from "./view-hooks"

// スクリーンの定義の、渡す値の形（確かめて通った値の型 P だけを見る）
interface PropsShape<P> {
  safeParse(value: unknown): { success: true; data: P } | { success: false }
}

// 描いている場所のスクリーン（定義 def のスクリーンの中のビューが使う）: 渡された値・見えているか・カレントスクリーンか（定義を問わず見えているか・カレントスクリーンかだけを知るなら useScreenHere）。
// スクリーンの外や、ほかの定義のスクリーンの中で呼べば E126
export function useScreen<P>(def: { id: string; props: PropsShape<P> }): {
  props: P
  shown: boolean
  current: boolean
} {
  const here = useScreenContext()
  if (here === NO_SCREEN || here.def !== def.id) fail("E126", { screen: def.id })
  const { props, shown, current } = here
  return useMemo(() => ({ props: props as P, shown, current }), [props, shown, current])
}

// 描いている場所のスクリーンが、見えているか・カレントスクリーンか（定義を問わない。スクリーンの定義を持たないビューが、自分のいるスクリーンを知るのに使う）。
// スクリーンの外（窓の枠のウィジェットなど）で呼べば NO_SCREEN
export function useScreenHere(): { shown: boolean; current: boolean } | typeof NO_SCREEN {
  const here = useScreenContext()
  const shown = here === NO_SCREEN ? undefined : here.shown
  const current = here === NO_SCREEN ? undefined : here.current
  return useMemo(
    () => (shown === undefined || current === undefined ? NO_SCREEN : { shown, current }),
    [shown, current],
  )
}

// スクリーンを開く・描いている場所のスクリーンを閉じる・渡す値を替える。描いている場所のスクリーンは、スクリーンの外（窓の枠のウィジェットなど）ならカレントスクリーン。
// - open: 定義 def のスクリーンを 1 枚開いてカレントスクリーンにする（値が定義の形に合わなければ開かず false）
// - setProps: 描いている場所のスクリーンに渡す値を替える（スクリーンは積まず、ブラウザの履歴には積む。そのスクリーンが定義 def の物でないか、値が形に合わなければ替えず false）
// - close: 描いている場所のスクリーンを閉じる（最初から開いているスクリーンの最後の 1 枚は閉じない）
// ほかのスクリーンを名指す操作は、スクリーンアレンジメントのウィジェットの中だけ（useArrangedScreens）
export function useScreens(): {
  open<P>(def: { id: string; props: PropsShape<P> }, props: P): boolean
  setProps<P>(def: { id: string; props: PropsShape<P> }, props: P): boolean
  close(): void
} {
  const here = useScreenIdHere() ?? null
  const read = useReadState()
  const { openScreen, setScreenProps, closeScreen } = useStoreActions()
  return useMemo(() => {
    const at = () => here ?? currentScreen(read().window).id
    return {
      open: <P>(def: { id: string; props: PropsShape<P> }, props: P) => openScreen(def.id, props),
      setProps: <P>(def: { id: string; props: PropsShape<P> }, props: P) => {
        const screen = at()
        if (read().window.screens.find(s => s.id === screen)?.def !== def.id) return false
        return setScreenProps(screen, props)
      },
      close: () => closeScreen(at()),
    }
  }, [here, read, openScreen, setScreenProps, closeScreen])
}

// スクリーンアレンジメントのウィジェットが並べるスクリーン: 開いているスクリーンの並び（開いた順。1 枚ごとの id・定義の id・渡された値・見えているか・カレントスクリーンか）と、
// スクリーンアレンジメントの値と、カレントスクリーンにする・閉じる（どれもスクリーンを id で名指す）。スクリーンアレンジメントのウィジェットの中でだけ呼べる（外なら E128。
// その中に描いたスクリーンの中も外）。1 枚を描くのは ScreenView
export function useArrangedScreens(): {
  screens: readonly { id: string; def: string; props: unknown; shown: boolean; current: boolean }[]
  value: unknown
  makeCurrent(id: string): void
  close(id: string): void
} {
  if (!useArranged()) fail("E128", { name: "useArrangedScreens" })
  const catalog = useCoreCatalog()
  const opened = useMatomezuState(s => s.window.screens)
  const current = useMatomezuState(s => currentScreen(s.window).id)
  const shown = useMatomezuState(useShallow(s => shownScreens(catalog, s.window)))
  const value = useMatomezuState(s => s.window.arrangementValue)
  const { makeScreenCurrent, closeScreen } = useStoreActions()
  return useMemo(
    () => ({
      screens: opened.map(s => ({
        id: s.id,
        def: s.def,
        props: s.props,
        shown: shown.includes(s.id),
        current: s.id === current,
      })),
      value,
      makeCurrent: makeScreenCurrent,
      close: closeScreen,
    }),
    [opened, current, shown, value, makeScreenCurrent, closeScreen],
  )
}

// 窓のスクリーンアレンジメント: 今の定義の id と、替える（定義と値。値を渡さなければ定義の初めの値。値は定義の value の形で、合わなければ替えない）。
// 値は並べるスクリーンを名指すので、読むのはスクリーンアレンジメントのウィジェットだけ（useArrangedScreens）
export function useScreenArrangement(): {
  id: string
  set<V>(def: { id: string; value?: { schema: { parse(v: unknown): V } } }, value?: V): void
} {
  const id = useMatomezuState(s => s.window.arrangement)
  const { setScreenArrangement } = useStoreActions()
  const set = useCallback(
    <V>(def: { id: string }, value?: V) => setScreenArrangement(def.id, value),
    [setScreenArrangement],
  )
  return useMemo(() => ({ id, set }), [id, set])
}

// 同じ同期の処理の中の窓の変わりを、ブラウザの履歴に積まずに書き換えてほしいと頼む関数（利用者の操作でない変わり。窓の大きさでスクリーンアレンジメントを戻すなど）
export function useReplaceHistory(): () => void {
  return useStoreActions().replaceHistory
}

// ブラウザの履歴を 1 つ戻す（ブラウザの戻るボタンと同じ。ブック・ページ・スクリーンの移動を、積んだ順に戻る）。
// canGoBack は、この窓の中に戻る先があるか（無いときの goBack は何もしない。窓の外へは出ない）
export function useBrowserBack(): { canGoBack: boolean; goBack(): void } {
  const canGoBack = useMatomezuState(s => s.canGoBack)
  const { requestBack } = useStoreActions()
  return { canGoBack, goBack: requestBack }
}
