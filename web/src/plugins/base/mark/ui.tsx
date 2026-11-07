// マークの見た目のウィジェット: ブックのレイヤーに置き、開いているブックのマークと、マークの種類を選ぶ所をスタンドで出す
import { defineWidget } from "../../../ui/layout"
import type { Bird } from "../birds"
import { useBirdFace } from "../birds/use-bird-sheet"
import { kit } from "../kit"
import { defineAnnotationIcon } from "../outbox/ui"
import { defineCornerStatus } from "../utils/corner"
import { BOOK_LAYERS } from "../workspace/slots"
import { MARK, type MarkProps } from "."
import { ALERT_STATUS_ID, AlertLook, MarkLayer } from "./MarkLayer"
import styles from "./MarkLayer.module.css"

export const MARK_LAYER = defineWidget({ id: kit.name("mark-layer"), slots: [BOOK_LAYERS], view: MarkLayer })

// 送信トレイの行の絵: 鳥のマークは鳥の顔、びっくりマークは !
export const MARK_ICON = defineAnnotationIcon({
  id: kit.name("mark-icon"),
  annotation: MARK.id,
  view: ({ annotation }) => {
    const kind = (annotation.props as MarkProps).kind
    return kind === "alert" ? <span className={styles.listedAlert}>!</span> : <ListedFace bird={kind} />
  },
})

// 送信トレイの行の鳥の顔（色を塗り終わるまでは丸だけ）
function ListedFace({ bird }: { bird: Bird }) {
  const face = useBirdFace(bird)
  return <span className={styles.listedFace} style={face ? { backgroundImage: `url(${face})` } : {}} />
}

// コーナーステータス: びっくりマーク
export const ALERT_STATUS = defineCornerStatus({ id: ALERT_STATUS_ID, title: kit.message("Alert"), view: AlertLook })
