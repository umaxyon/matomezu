// 印刷プレビューを開くボタン（ウィジェット print-preview-button。フッタメニューに置く）。ページを持つブックを編集している間だけ出す
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import styles from "../book-name/StageMenuButtons.module.css"
import { kit } from "../kit"
import type { StageSlotProps } from "../workspace/ui"
import { PRINT_PREVIEW_OPEN } from "."

export function PrintPreviewButton({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const open = useCommand(stage, PRINT_PREVIEW_OPEN.id)
  if (!open.shown) return null
  return (
    <button
      type="button"
      className={styles.item}
      aria-label={t("Print preview")}
      title={t("Print preview")}
      disabled={!open.enabled}
      onClick={() => open.run()}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  )
}
