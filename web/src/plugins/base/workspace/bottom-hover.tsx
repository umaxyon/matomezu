// ステージの下の行（stage-bottom）にポインタが乗っているか。workspace のビューが下の行ごとに渡し、下の行に置いたウィジェットが読む
// （下の行の外に置かれたウィジェットでは null）
import { createContext, useContext } from "react"

export const BottomHoverContext = createContext<boolean | null>(null)

export const useBottomHover = (): boolean | null => useContext(BottomHoverContext)
