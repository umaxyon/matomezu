// スライドのビュー（プレゼンテーション slide）: 紙の枠だけを出す（押しは受けない。下のレイヤーが受ける）。描画シェイプを描いて操作を受けるのは、slide プラグインのレイヤー（book-layers。ブックの中身の下）
import { useMessages, useStage } from "../../../../plugin-api/ui"
import { PaperFrame } from "../../../base/ui"
import { kit } from "../kit"
import styles from "./SlideView.module.css"

export function SlideView() {
  const t = useMessages(kit)
  const stage = useStage()
  if (!stage) return null
  return <PaperFrame stage={stage} role="img" aria-label={t("Paper")} className={styles.paper} />
}
