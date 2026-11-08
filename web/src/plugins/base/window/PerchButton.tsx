// 止まり木のボタン（ウィジェット control-center-perch）。コントロールセンターを前に出している間は押された状態で、押すとブックスクリーンへ戻る。
// コマンドは前に出せるブックスクリーンのカレントのステージから呼ぶ
import { screenOf } from "../../../core/window"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import buttons from "../utils/FooterButtons.module.css"
import { CONTROL_CENTER_TOGGLE } from "."

export function PerchButton() {
  const stage = useMatomezuState(s => screenOf(s.window).current)
  const command = useCommand(stage, CONTROL_CENTER_TOGGLE.id)
  const icon = useUiCatalog().commandIcons.get(CONTROL_CENTER_TOGGLE.id)
  const t = useMessages(kit)
  return (
    <button
      type="button"
      className={buttons.item}
      aria-label={t(command.title)}
      aria-pressed={command.active}
      disabled={!command.enabled}
      onClick={() => command.run()}
    >
      {icon}
    </button>
  )
}
