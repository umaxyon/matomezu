// ステージの列のスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す）。どれも、何も渡さない
import { kit } from "../kit"

export const STAGE_TOP = kit.name("stage-top")
// ステージの本体の左に、本体と並べて置く列（縦に並べる一覧など。幅はウィジェットが決める）
export const STAGE_SIDE = kit.name("stage-side")
export const STAGE_BODY = kit.name("stage-body")
export const STAGE_BOTTOM = kit.name("stage-bottom")
export const STAGE_BOTTOM_LEFT = kit.name("stage-bottom-left")
export const STAGE_CORNER = kit.name("stage-corner")
// ステージの中のレイヤー（ステージのビューが開く）。並べた順に下から重ねる。紙の座標で描くレイヤーは PaperFrame の中に描く
export const BOOK_LAYERS = kit.name("book-layers")
// 印刷区画 1 つの中のレイヤー（印刷プレビューと印刷と、ページ一覧のサムネイルが開く）。並べた順に下から重ねる。渡すのは PrintSheetProps
export const SHEET_LAYERS = kit.name("sheet-layers")
