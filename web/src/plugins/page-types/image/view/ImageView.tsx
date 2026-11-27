// 画像のビュー（プレゼンテーション image）: 紙の枠の中に、ページの画像を描く（押しは受けない）。印刷では、測るだけのビューが画像を読み終えるのを待ち、印刷区画 1 つのビューが描く
import { NO_STAGE } from "../../../../plugin-api"
import { useShownPage, useStage } from "../../../../plugin-api/ui"
import { PaperFrame, type PrintMeasureProps, type PrintSheetProps } from "../../../base/ui"
import { assetOf } from "../image"
import { ImagePicture } from "./ImagePicture"

export function ImageView() {
  const stage = useStage()
  const page = useShownPage()
  if (stage === NO_STAGE || typeof page !== "object") return null
  return (
    <PaperFrame stage={stage} style={{ pointerEvents: "none" }}>
      <ImagePicture asset={assetOf(page)} />
    </PaperFrame>
  )
}

// 印刷区画 1 つのビュー（紙は 1 枚）
export function ImageSheet({ page, paper }: PrintSheetProps) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: paper.w, height: paper.h }}>
      <ImagePicture asset={assetOf(page)} />
    </div>
  )
}

// 測るだけのビュー: 画像を読み終えたら（読めなくても）、印刷区画 1 つを知らせる（それまで印刷プレビューは並べず、刷れない）
export function ImageMeasure({ page, paper, report }: PrintMeasureProps) {
  const asset = assetOf(page)
  return (
    <div style={{ position: "relative", width: paper.w, height: paper.h }}>
      <ImagePicture asset={asset} onDone={() => report({ rows: 1, data: asset })} />
    </div>
  )
}
