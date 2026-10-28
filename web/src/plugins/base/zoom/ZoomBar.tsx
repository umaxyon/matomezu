// 拡大縮小の帯: 初めの位置に戻す・縮小・今の倍率・拡大（コマンド zoom-reset・zoom-out・zoom-in）。押してもステージへは渡さない
import type { ReactNode } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { ZOOM_IN, ZOOM_OUT, ZOOM_RESET } from "."
import { ZOOM_ICONS } from "./icons"
import styles from "./ZoomBar.module.css"

export function ZoomBar({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const zoom = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.zoom ?? 1)
  const reset = useCommand(stage, ZOOM_RESET.id)
  const out = useCommand(stage, ZOOM_OUT.id)
  const zin = useCommand(stage, ZOOM_IN.id)
  return (
    <div className={styles.bar} onPointerDown={e => e.stopPropagation()}>
      <Button command={reset} icon={ZOOM_ICONS[ZOOM_RESET.id]} className={styles.reset} />
      <Button command={{ ...out, run: () => out.run(null) }} icon={ZOOM_ICONS[ZOOM_OUT.id]} />
      <span className={styles.level} title={t("Zoom")}>{`${Math.round(zoom * 100)}%`}</span>
      <Button command={{ ...zin, run: () => zin.run(null) }} icon={ZOOM_ICONS[ZOOM_IN.id]} />
    </div>
  )
}

interface Command {
  title: MessageKey
  shown: boolean
  enabled: boolean
  run(): void
}

function Button({ command, icon, className }: { command: Command; icon: ReactNode; className?: string }) {
  const t = useMessages(kit)
  if (!command.shown) return null
  return (
    <button
      type="button"
      className={className ? `${styles.button} ${className}` : styles.button}
      title={t(command.title)}
      aria-label={t(command.title)}
      disabled={!command.enabled}
      onClick={() => command.run()}
    >
      {icon}
    </button>
  )
}
