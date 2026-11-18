// 書庫の画面の履歴のボタン: 元に戻す・やり直すを横に並べる（右の枠の上のボタンの行に置く）。
// 押せない間も disabled にはしない（焦点のあるボタンが disabled になると、キーの範囲 library のキーが届かなくなるため。aria-disabled で知らせ、押しても行わない）
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { LIBRARY_REDO, LIBRARY_UNDO } from "./commands"
import styles from "./LibraryView.module.css"

export function HistoryButtons() {
  return (
    <>
      <HistoryButton id={LIBRARY_UNDO.id} />
      <HistoryButton id={LIBRARY_REDO.id} />
    </>
  )
}

function HistoryButton({ id }: { id: typeof LIBRARY_UNDO.id | typeof LIBRARY_REDO.id }) {
  const command = useCommand(id)
  const icon = useUiCatalog().commandIcons.get(id)
  const t = useMessages(kit)
  return (
    <button
      type="button"
      className={styles.historyButton}
      aria-label={t(command.title)}
      title={t(command.title)}
      aria-disabled={!command.enabled}
      onClick={() => {
        if (command.enabled) command.run()
      }}
    >
      {icon ?? t(command.title)}
    </button>
  )
}
