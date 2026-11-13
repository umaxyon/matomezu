// 描いている場所のスクリーン: 窓の枠が、開いているスクリーン 1 枚ごとに、その中のビューへ渡す（そのスクリーンの id・定義の id・渡された値・前に出ているか）。
// スクリーンの中のビュー（ウィジェット・ダイアログなど）は、自分がどのスクリーンにいるかを、ここから読む
import { createContext, type ReactNode, useContext } from "react"

export interface ScreenHere {
  id: string // 開いた 1 枚ごとの id
  def: string // スクリーンの定義の id
  props: unknown // 開くときに渡された値
  front: boolean // 窓の前に出ているか
}

const ScreenContext = createContext<ScreenHere | null>(null)

export function ScreenProvider({ screen, children }: { screen: ScreenHere; children: ReactNode }) {
  return <ScreenContext.Provider value={screen}>{children}</ScreenContext.Provider>
}

// 描いている場所のスクリーン（スクリーンの外で描いているなら null）
export const useScreenHere = (): ScreenHere | null => useContext(ScreenContext)
