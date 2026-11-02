// フッタメニューを下げる関数。フッタメニューが中のスロットに置いたウィジェットに渡し、項目を選んだウィジェットが呼ぶ（フッタメニューの外では null）
import { createContext, useContext } from "react"

export const FooterMenuContext = createContext<(() => void) | null>(null)

export const useCloseFooterMenu = (): (() => void) | null => useContext(FooterMenuContext)
