// 履歴のボタン（ウィジェット history-buttons）: 元に戻す・やり直すを横に並べる。続けて押せるように、押してもドロワーは下げない
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useUiCatalog } from "../../../ui/store-context"
import { REDO, UNDO } from "../history"
import { kit } from "../kit"
import styles from "./StageMenuButtons.module.css"

export function HistoryButtons({ stage }: { stage: string }) {
  return (
    <div className={styles.buttons}>
      <HistoryButton stage={stage} id={UNDO.id} />
      <HistoryButton stage={stage} id={REDO.id} />
    </div>
  )
}

function HistoryButton({ stage, id }: { stage: string; id: typeof UNDO.id | typeof REDO.id }) {
  const command = useCommand(stage, id)
  const icon = useUiCatalog().commandIcons.get(id)
  const t = useMessages(kit)
  return (
    <button
      type="button"
      className={styles.item}
      aria-label={t(command.title)}
      disabled={!command.enabled}
      onClick={() => command.run()}
    >
      {icon ?? t(command.title)}
    </button>
  )
}
