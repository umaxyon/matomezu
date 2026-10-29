// ドロワーを下げる関数。ドロワーが中のスロットに置いたウィジェットに渡し、項目を選んだウィジェットが呼ぶ（ドロワーの外では null）
import { createContext, useContext } from "react"

export const DrawerContext = createContext<(() => void) | null>(null)

export const useCloseDrawer = (): (() => void) | null => useContext(DrawerContext)
