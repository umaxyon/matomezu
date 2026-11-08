// スライドの印刷区画 1 つのビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの slide のアイテムを、見るだけで描く。
// 入力は受けない。紙の外にはみ出た所は、紙の境目で切れる
import { type ItemPage, slideOf } from "../../../plugin-api"
import { useStage } from "../../../plugin-api/ui"
import type { PrintSheetProps } from "../../base/ui"
import { SlideItem } from "./SlideItem"

export function SlideSheet({ stage: id, page }: PrintSheetProps) {
  const stage = useStage(id)
  if (!stage) return null
  return (
    <>
      {slideOf(page as ItemPage).map(shape => (
        <SlideItem key={shape.id} shape={shape} stage={id} zoom={stage.zoom} />
      ))}
    </>
  )
}
