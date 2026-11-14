// スクラップボックスのビュー: 項目のスクラップを、base の部品（ScrapView）で描き、その上に枠線を引く（大きさを変えないよう、内側に 1 本）。
// 中は見るだけで、押しても中の物は選ばれない（選ばれるのはこの形）
import type { ItemProps } from "../../../plugin-api"
import type { ItemViewProps } from "../../../plugin-api/ui"
import { colorPaint } from "../../base"
import { ScrapView } from "../../base/ui"
import { NO_LINE, type SCRAP_BOX } from "."
import styles from "./ScrapBoxView.module.css"

// 枠線の色（CSS の値。引かなければ null）: 無ければテーマの線の色、色ならその色
export const lineColor = (line: string | undefined): string | null =>
  line === undefined ? "var(--scrap-line)" : line === NO_LINE ? null : colorPaint(line).fill

export function ScrapBoxView({ props, zoom }: ItemViewProps<ItemProps<typeof SCRAP_BOX.id>>) {
  const { line, ...scrap } = props
  const color = lineColor(line)
  return (
    <div className={styles.box}>
      <ScrapView scrap={scrap} zoom={zoom} />
      {color && <div className={styles.line} data-scrap-line style={{ outlineColor: color }} />}
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
