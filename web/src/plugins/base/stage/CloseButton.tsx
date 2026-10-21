// ステージを閉じるボタン（ウィジェット close-button）: コマンド stage.close を出すときだけ描く
import { useCommand } from "../../../ui/commands"
import { useT } from "../../../ui/i18n"
import styles from "./CloseButton.module.css"

export function CloseButton({ stage }: { stage: string }) {
  const close = useCommand(stage, "stage.close")
  const t = useT()
  if (!close.shown) return null
  return (
    <button type="button" className={styles.close} aria-label={t(close.title)} onClick={() => close.run()}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}
