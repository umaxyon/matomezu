// 印刷区画の区切りの線を見せる・隠すボタン（ウィジェット print-area-toggle。ドロワーに置く）。可変ページで印刷区画が 2 つ以上あるときだけ出す
import { areaOf, paperOf } from "../../../core/stage"
import { useMessages } from "../../../ui/i18n"
import { useStage } from "../../../ui/view-hooks"
import styles from "../book-name/StageMenuButtons.module.css"
import { kit } from "../kit"
import { printAreaLines } from "../place/grow"
import { usePrintAreasHidden, useTogglePrintAreas } from "./print-areas"

export function PrintAreaToggle({ stage: id }: { stage: string }) {
  const t = useMessages(kit)
  const stage = useStage(id)
  const hidden = usePrintAreasHidden(id)
  const toggle = useTogglePrintAreas()
  const paper = stage && paperOf(stage)
  const area = stage && areaOf(stage)
  if (!paper || !area || !printAreaLines(paper, area)) return null
  return (
    <button
      type="button"
      className={styles.item}
      aria-label={t("Print areas")}
      title={t("Print areas")}
      aria-pressed={!hidden}
      onClick={() => toggle(id)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 4v16M3 12h18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    </button>
  )
}
