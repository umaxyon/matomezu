// 画像のビュー（プレゼンテーション image）: 紙の枠の中に、ページの画像を描く（押しは受けない。画面の上の右クリックで画像のページのメニュー image-context を開く）。印刷では、印刷区画 1 つのビューが描き、画像を読み終えるまで刷らせない。
// スクラップは、画像の上の座標で切り抜き、紙の余白なしに画像だけを描く（scrapView）

import { NO_STAGE } from "../../../../plugin-api"
import { useContextMenu, useShownPage, useStage } from "../../../../plugin-api/ui"
import { PaperFrame, type PrintSheetProps } from "../../../base/ui"
import { assetOf, IMAGE_CONTEXT } from "../image"
import { ImagePicture } from "./ImagePicture"

export function ImageView() {
  const stage = useStage()
  const page = useShownPage()
  const openMenu = useContextMenu(IMAGE_CONTEXT)
  if (stage === NO_STAGE || typeof page !== "object") return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div style={{ position: "absolute", inset: 0 }} onContextMenu={e => openMenu(e, {})}>
      <PaperFrame stage={stage} style={{ pointerEvents: "none" }}>
        <ImagePicture asset={assetOf(page)} />
      </PaperFrame>
    </div>
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

// スクラップの中身: 画像を、切り抜く広さ（画像の幅と高さ）いっぱいに、余白なしで描く
export function ImageScrap({ page }: Pick<PrintSheetProps, "page">) {
  return <ImagePicture asset={assetOf(page)} margin={0} />
}
