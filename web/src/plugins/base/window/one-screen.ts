// スクリーンアレンジメント「1 枚ずつ」の定義（並びの変わり apply-split も読むので、窓の定義 index.ts とは分けて置く）
import { kit } from "../kit"

// base のスクリーンアレンジメントが窓に開いておくスクリーンの枚数（コントロールセンターなど、窓を開いたときから開いているスクリーンは数えない）
export const SCREENS_KEPT = 3

// スクリーンアレンジメント「1 枚ずつ」: 見えているのは、カレントスクリーンの 1 枚だけ。窓を開いたときのスクリーンアレンジメント。
// ブックスクリーンは動かさず、ステージを並べないスクリーンは右から滑り込み、その間は下の行（スロット screen-footer に置いた物があれば）を出す（描き方は WindowView）
export const ONE_SCREEN = kit.defineScreenArrangement({
  id: "one-screen",
  title: "One screen at a time",
  aiDescription: "Shows one screen at a time: the current screen. The others stay open behind it, unseen.",
  shown: (_, order) => order.slice(-1),
  atStart: true,
  maxScreens: SCREENS_KEPT,
})
