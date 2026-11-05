// 印刷区画の中で描いているか（印刷プレビューと印刷で、印刷区画 1 つのビューの中を描くとき。PrintPreviewView が置く）。
// 描いた物を書く画面の状態に残す部品（つなぐもののミニマップの絵など）は、この中では残さない
import { createContext, useContext } from "react"

export const PrintingContext = createContext(false)

export const usePrinting = (): boolean => useContext(PrintingContext)
