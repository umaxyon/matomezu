// 画像のビュー（プレゼンテーション image）: 紙の枠の中に、ページの画像を描く（押しは受けない）。印刷では、印刷区画 1 つのビューが描き、画像を読み終えるまで刷らせない
import { NO_STAGE } from "../../../../plugin-api"
import { useShownPage, useStage } from "../../../../plugin-api/ui"
import { PaperFrame, type PrintSheetProps } from "../../../base/ui"
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
