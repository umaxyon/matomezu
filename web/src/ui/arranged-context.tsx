// スクリーンアレンジメントの中か: 窓の枠がスクリーンアレンジメントのウィジェットを描く所で true にし、ScreenView が描くスクリーンの中で false に戻す。
// 並べるスクリーンを id で名指す物（useArrangedScreens・ScreenView）は、この中でだけ使える
import { createContext, type ReactNode, useContext } from "react"

const ArrangedContext = createContext(false)

export function ArrangedProvider({ arranged, children }: { arranged: boolean; children: ReactNode }) {
  return <ArrangedContext.Provider value={arranged}>{children}</ArrangedContext.Provider>
}

// 描いている所が、スクリーンアレンジメントのウィジェットの中か（その中に描いたスクリーンの中は除く）
export const useArranged = (): boolean => useContext(ArrangedContext)
