// 描いている場所のスクリーン: 窓の枠が、開いているスクリーン 1 枚ごとに、その中のビューへ渡す（そのスクリーンの id・定義の id・渡された値・見えているか・カレントスクリーンか）。
// スクリーンの中のビュー（ウィジェット・ダイアログなど）は、自分がどのスクリーンにいるかを、ここから読む
import { createContext, type ReactNode, useContext, useMemo } from "react"

export interface ScreenHere {
  id: string // 開いた 1 枚ごとの id
  def: string // スクリーンの定義の id
  props: unknown // 開くときに渡された値
  shown: boolean // 見えているか（スクリーンアレンジメントが描いているか）
  current: boolean // カレントスクリーンか（キーが効く先）
}

// 描いている場所がスクリーンの外のときの値
export const NO_SCREEN = "none"

const ScreenContext = createContext<ScreenHere | typeof NO_SCREEN>(NO_SCREEN)

// 渡す値は、中身が同じ間は同じ参照に保つ（描いている場所を読む物を、スクリーンの中の何かが変わるたびに描き直さないため）
export function ScreenProvider({ screen, children }: { screen: ScreenHere; children: ReactNode }) {
  const { id, def, props, shown, current } = screen
  const value = useMemo(() => ({ id, def, props, shown, current }), [id, def, props, shown, current])
  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>
}

// 描いている場所のスクリーン（スクリーンの外で描いているなら NO_SCREEN）
export const useScreenContext = (): ScreenHere | typeof NO_SCREEN => useContext(ScreenContext)

// 描いている場所のスクリーンの、開いた 1 枚ごとの id（スクリーンの外で描いているなら undefined）
export function useScreenIdHere(): string | undefined {
  const here = useScreenContext()
  return here === NO_SCREEN ? undefined : here.id
}
