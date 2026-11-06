// 印刷区画の中で描いているか（印刷プレビューと印刷で、印刷区画 1 つのビューと測るだけのビューの中を描くとき。PrintPreviewView が Printing で包む）。
// 描いた物を書く画面の状態に残すフック（つなぐもののミニマップの絵の useDrawnMinimap など）は、この中では残さない。
// 中の物にアンカーは付かない（印刷プレビューのビューは、ステージがアンカーの表の外に描く。StageView の BookContent）
import { createContext, type ReactNode, useContext } from "react"

const PrintingContext = createContext(false)

export const usePrinting = (): boolean => useContext(PrintingContext)

export function Printing({ children }: { children: ReactNode }) {
  return <PrintingContext.Provider value={true}>{children}</PrintingContext.Provider>
}
