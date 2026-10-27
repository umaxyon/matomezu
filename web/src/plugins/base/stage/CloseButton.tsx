// ステージを閉じるボタン（ウィジェット close-button）: コマンド stage-close を出すときだけ描く
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { STAGE_CLOSE } from "."
import styles from "./CloseButton.module.css"

export function CloseButton({ stage }: { stage: string }) {
  const close = useCommand(stage, STAGE_CLOSE.id)
  const t = useMessages(kit)
  if (!close.shown) return null
  return (
    <button type="button" className={styles.close} aria-label={t(close.title)} onClick={() => close.run()}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}
