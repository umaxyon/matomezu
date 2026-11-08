// 窓の根のビュー（ウィジェット window）: ブックスクリーン（スロット book-screen）とコントロールセンター（スロット control-center-screen と、下のフッター）を重ねて描く。
// 前に出ている物（窓の front）は全面に出し、後ろに退いた物は消さずに隠す（中のステージ・倍率・選択などは残る）。隠れている物は操作も読み上げも受けない（inert）。
// コントロールセンターは、前に出すときに右から滑り込み、戻すときに右へ滑り出る（SLIDE_MS。動きを減らす設定では動かさない）。
// コントロールセンターのフッターは止まり木のボタン（コマンド control-center-toggle）だけで、押すとブックスクリーンへ戻る。
// コマンドは前に出せるブックスクリーンのカレントのステージから呼ぶ
import type { CSSProperties } from "react"
import { screenOf } from "../../../core/window"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { Slot } from "../../../ui/Slot"
import { useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import menuStyles from "../book-name/StageMenuButtons.module.css"
import { kit } from "../kit"
import { SLIDE_MS } from "../right-side-panel/hooks"
import { CONTROL_CENTER_TOGGLE } from "."
import { BOOK_SCREEN, CONTROL_CENTER_SCREEN } from "./slots"
import styles from "./WindowView.module.css"

export function WindowView() {
  const front = useMatomezuState(s => s.window.front)
  return (
    <div className={styles.window} style={{ ["--front-slide" as string]: `${SLIDE_MS}ms` } as CSSProperties}>
      <div className={styles.bookScreen} data-front={front} inert={front !== "book-screen"}>
        <Slot name={BOOK_SCREEN} props={{}} />
      </div>
      <section className={styles.center} data-front={front} inert={front !== "control-center"}>
        <div className={styles.body}>
          <Slot name={CONTROL_CENTER_SCREEN} props={{}} />
        </div>
        <footer className={styles.footer}>
          <PerchButton />
        </footer>
      </section>
    </div>
  )
}

// 止まり木のボタン。コントロールセンターを前に出している間は押された状態で、押すとブックスクリーンへ戻る
function PerchButton() {
  const stage = useMatomezuState(s => screenOf(s.window).current)
  const command = useCommand(stage, CONTROL_CENTER_TOGGLE.id)
  const icon = useUiCatalog().commandIcons.get(CONTROL_CENTER_TOGGLE.id)
  const t = useMessages(kit)
  return (
    <button
      type="button"
      className={menuStyles.item}
      aria-label={t(command.title)}
      aria-pressed={command.active}
      disabled={!command.enabled}
      onClick={() => command.run()}
    >
      {icon}
    </button>
  )
}
