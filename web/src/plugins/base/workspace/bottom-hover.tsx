// ステージの下の行（stage-bottom）にポインタが乗っているか。workspace のビューが下の行ごとに渡し、下の行に置いたウィジェットが読む
// （下の行の外に置かれたウィジェットでは null）。乗っていなければ 0、乗っている間は、行の中で別の要素に乗るたびに増える数
// （乗ったまま一度閉じた物を、行の中で動いたら開き直せるように）
import { createContext, useContext } from "react"

export const BottomHoverContext = createContext<number | null>(null)

export const useBottomHover = (): number | null => useContext(BottomHoverContext)
