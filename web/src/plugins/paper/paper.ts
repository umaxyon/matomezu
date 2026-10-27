import { kit } from "./kit"
// 紙の見せ方: ページごとに紙を置き、その上に形を置いて、選ぶ・動かす・大きさを変える・置く・消す。つなぐもの（線など）は、そのビューの層を重ねる

export const PAPER = kit.definePresentation({ id: "paper" })

// 紙のビューが開く右クリックのメニュー: 紙の画面と、置いたアイテム（ui.tsx で機能台帳の型の側に書き足す）
export const PAPER_CONTEXT = kit.name("paper-context")
export const ITEM_CONTEXT = kit.name("item-context")
