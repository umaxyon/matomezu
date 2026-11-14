// スクラップボックスのビュー: 項目のスクラップを、base の部品（ScrapView）で描く。中は見るだけで、押しても中の物は選ばれない（選ばれるのはこの形）
import type { ItemProps } from "../../../plugin-api"
import type { ItemViewProps } from "../../../plugin-api/ui"
import { ScrapView } from "../../base/ui"
import type { SCRAP_BOX } from "."
import styles from "./ScrapBoxView.module.css"

export function ScrapBoxView({ props, zoom }: ItemViewProps<ItemProps<typeof SCRAP_BOX.id>>) {
  return (
    <div className={styles.box}>
      <ScrapView scrap={props} zoom={zoom} />
    </div>
  )
}

// アイコン（切り抜いた枠）
export const SCRAP_BOX_ICON = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <rect
      x="4"
      y="6"
      width="16"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="3 2"
    />
  </svg>
)
