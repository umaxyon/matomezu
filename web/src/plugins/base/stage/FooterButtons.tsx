// ステージの下の行の頭の「閉じる」と、右端の「□」（広げる）。
// 閉じる: ステージを分けていれば、このステージを閉じる。分けていなければ、ブックスクリーンを閉じる（上下に分けた並びの中なら、並びから外してから。窓の最後の 1 枚なら出さない）。
// □: ステージを分けていれば、このステージだけを広げて見せる（もう一度で戻す）。分けていなくて、上下に分けた並びの中なら、並びを覚えたまま、このスクリーンだけを窓いっぱいにする（もう一度で並びに戻す）。
// 最初から窓いっぱいに開いていれば、戻す絵で出し、後ろのコントロールセンターなどを上、このスクリーンを下に分ける。窓が低い・後ろに何も無ければ出さない
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
  const shown = stage.shown ? stage : screen
  if (!shown.shown) return null
  const label = t(shown.title)
  return (
    <button
      type="button"
      className={styles.close}
      aria-label={label}
      title={label}
      data-footer-close
      onClick={() => shown.run()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
      {t("Close")}
    </button>
  )
}

export function FooterWidenButton() {
  const t = useMessages(kit)
  const widen = useCommand(STAGE_WIDEN.id)
  const split = useScreenSplit()
  if (!widen.shown && !split.inSplit && !split.wide && !split.rowsShown) return null
  // 押されている見た目（戻す絵）: ステージを広げている間と、並びを覚えたままスクリーンを広げている間と、最初から窓いっぱいに開いている間
  const active = widen.shown ? widen.active : split.wide || split.rowsShown
  const label = widen.shown
    ? t(widen.active ? "Restore stage" : "Widen stage")
    : t(split.wide ? "Restore split" : split.rowsShown ? "Split into rows" : "Maximize screen")
  const press = () => {
    if (widen.shown) return widen.run()
    if (split.wide) return split.unwiden()
    if (split.rowsShown) return split.toRows()
    split.widen()
  }
  return (
    <button
      type="button"
      className={styles.maximize}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-footer-widen
      onClick={press}
    >
      {active ? (
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
