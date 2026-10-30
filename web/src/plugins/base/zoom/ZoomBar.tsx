// 拡大縮小の帯: 左に初めの位置に戻す・ページ全体を収める、右に縮小・今の倍率・拡大（コマンド zoom-reset・zoom-fit・zoom-out・zoom-in）。押してもステージへは渡さない。
// 帯の上でホイールを回すと、回した量をコマンド zoom-wheel に渡して、表示領域の真ん中を動かさずに拡大縮小する（ページをスクロールさせない）
import { type ReactNode, useEffect, useRef } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { ZOOM_FIT, ZOOM_IN, ZOOM_OUT, ZOOM_RESET, ZOOM_WHEEL } from "."
import { ZOOM_ICONS } from "./icons"
import styles from "./ZoomBar.module.css"

// className は帯に足す見た目（置く所に合わせた余白など）
export function ZoomBar({ stage, className }: { stage: string; className?: string }) {
  const t = useMessages(kit)
  const zoom = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.zoom ?? 1)
  const reset = useCommand(stage, ZOOM_RESET.id)
  const fit = useCommand(stage, ZOOM_FIT.id)
  const out = useCommand(stage, ZOOM_OUT.id)
  const zin = useCommand(stage, ZOOM_IN.id)
  const wheel = useCommand(stage, ZOOM_WHEEL.id)
  const wheelRef = useRef(wheel)
  wheelRef.current = wheel
  const ref = useRef<HTMLDivElement>(null)
  // ページのスクロールを止めるため、受け身でない受け取りで付ける
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!wheelRef.current.shown) return
      e.preventDefault()
      e.stopPropagation()
      wheelRef.current.run({ delta: e.deltaY })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])
  return (
    <div
      ref={ref}
      className={className ? `${styles.bar} ${className}` : styles.bar}
      onPointerDown={e => e.stopPropagation()}
    >
      <Button command={reset} icon={ZOOM_ICONS[ZOOM_RESET.id]} />
      <Button command={fit} icon={ZOOM_ICONS[ZOOM_FIT.id]} className={styles.fit} />
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
