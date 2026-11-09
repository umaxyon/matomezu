// スライドのビュー（見せ方 slide）: 紙の枠だけを出す。スライドのアイテムを描いて操作を受けるのは、slide プラグインのレイヤー（book-layers）。ページが無いときは知らせを出す
import { type BookViewProps, useMessages, useStage } from "../../../../plugin-api/ui"
import { PaperFrame } from "../../../base/ui"
import { kit } from "../kit"
import styles from "./SlideView.module.css"

export function SlideView({ stage: id }: BookViewProps) {
  const t = useMessages(kit)
  const stage = useStage(id)
  if (!stage) return null
  if (stage.opened?.page === null) return <p className={styles.empty}>{t("No slides yet")}</p>
  return <PaperFrame stage={stage} role="img" aria-label={t("Paper")} />
}
