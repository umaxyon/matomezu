// ステージの下の行の頭の「閉じる」と、右端の「□」（広げる）。
// 閉じる: ステージを分けていれば、このステージを閉じる。分けていなければ、ブックスクリーンを閉じる（上下に分けた並びの中なら、並びから外してから。窓の最後の 1 枚なら出さない）。
// □: ステージを分けていれば、このステージだけを広げて見せる（もう一度で戻す）。分けていなくて、上下に分けた並びの中なら、このスクリーンだけを窓いっぱいにする（並びのほかの物は閉じる）。どちらでもなければ出さない
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { BOOK_SCREEN_CLOSE } from "../window"
import { useScreenSplit } from "../window/useScreenSplit"
import { STAGE_CLOSE, STAGE_WIDEN } from "."
import styles from "./FooterButtons.module.css"

export function FooterCloseButton() {
  const t = useMessages(kit)
  const stage = useCommand(STAGE_CLOSE.id)
  const screen = useCommand(BOOK_SCREEN_CLOSE.id)
  const split = useScreenSplit()
  if (!stage.shown && !split.inSplit && !screen.shown) return null
  // 並びから外すだけでは、ブックスクリーンは閉じない（並びの決まり）。外してから閉じる
  const close = () => {
    if (stage.shown) return stage.run()
    if (split.inSplit) split.close()
    screen.run()
  }
  return (
    <button
      type="button"
      className={styles.close}
      aria-label={t(stage.shown ? "Close stage" : "Close screen")}
      title={t(stage.shown ? "Close stage" : "Close screen")}
      data-footer-close
      onClick={close}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
      {t("Close")}
    </button>
  )
}

export function FooterMaximizeButton() {
  const t = useMessages(kit)
  const widen = useCommand(STAGE_WIDEN.id)
  const split = useScreenSplit()
  if (!widen.shown && !split.inSplit) return null
  const label = widen.shown ? t(widen.active ? "Restore stage" : "Maximize stage") : t("Maximize screen")
  return (
    <button
      type="button"
      className={styles.maximize}
      aria-label={label}
      aria-pressed={widen.shown ? widen.active : undefined}
      title={label}
      data-footer-maximize
      onClick={() => (widen.shown ? widen.run() : split.expand())}
    >
      {widen.shown && widen.active ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
          <path d="M8.5 8.5v-3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
        </svg>
      )}
    </button>
  )
}
