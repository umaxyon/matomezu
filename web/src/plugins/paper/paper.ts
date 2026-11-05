import { itemAiPlaced, itemMinimapMarks } from "../base"
import { kit } from "./kit"
// 紙の見せ方: ページごとに紙を置き、その上に形を置いて、選ぶ・動かす・大きさを変える・置く・消す。つなぐもの（線など）は、そのビューで形の並びを包み、手前に描く

export const PAPER = kit.definePresentation({
  id: "paper",
  minimap: itemMinimapMarks, // ミニマップには、置いたアイテムの絵を描く
  aiPlaced: itemAiPlaced, // AI には、置いたアイテムの描いた位置と大きさを見せる
})

// 紙のビューが開く右クリックのメニュー: 紙の画面と、置いたアイテム（ui.tsx で core/catalog.ts に書き足す）
export const PAPER_CONTEXT = kit.name("paper-context")
export const ITEM_CONTEXT = kit.name("item-context")
