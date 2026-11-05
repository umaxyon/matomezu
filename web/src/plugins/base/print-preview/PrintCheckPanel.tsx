// 印刷の前のチェックの右サイドパネルの中身（ウィジェット print-check-panel）: 印刷区画の境目をまたいだ形があって印刷プレビューを開けないとき、
// 直してほしいと知らせ、またいだ形のバッジを並べる（押すとその形へ）。印刷区画より大きい形は、紙の境目で切れると添えて並べる。
// またいだ形が無くなれば、印刷プレビューを開くボタンを出す
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { useBook } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useOpenRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import type { StageSlotProps } from "../workspace/ui"
import { PRINT_PREVIEW_OPEN } from "."
import { bookCrossings } from "./book-sheets"
import styles from "./PrintPreviewPanel.module.css"
import { PRINT_CHECK_PANEL_ID } from "./panel-id"
import { ShapeBadges } from "./ShapeBadges"

export function PrintCheckPanel({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const book = useBook(stage)
  const open = useRightSidePanel(stage)
  const reopen = useOpenRightSidePanel()
  const preview = useCommand(stage, PRINT_PREVIEW_OPEN.id)
  if (!book || open?.widget !== PRINT_CHECK_PANEL_ID) return null
  const found = bookCrossings(catalog, book)
  const crossing = found.flatMap(f => f.crossing.map(id => ({ page: f.page, id })))
  const oversized = found.flatMap(f => f.oversized.map(id => ({ page: f.page, id })))
  // ほかのページの形へ移ると右サイドパネルは閉じるので、開き直す
  const keep = () => reopen(stage, { widget: PRINT_CHECK_PANEL_ID, subject: book.id, anchors: [], current: book.id })
  return (
    <div className={styles.panel}>
      <div className={styles.head}>{t("Print preview")}</div>
      {crossing.length > 0 ? (
        <>
          <p className={styles.message}>{t("Fix the boxes that cross print areas")}</p>
          <ShapeBadges stage={stage} shapes={crossing} label="Boxes that cross print areas" opened={keep} />
        </>
      ) : (
        <button type="button" className={styles.action} disabled={!preview.enabled} onClick={() => preview.run()}>
          {t("Open the print preview")}
        </button>
      )}
      {oversized.length > 0 && (
        <>
          <p className={styles.note}>{t("Larger than a print area, so cut at the sheet edges")}</p>
          <ShapeBadges stage={stage} shapes={oversized} label="Boxes larger than a print area" opened={keep} />
        </>
      )}
    </div>
  )
}
