// 書庫のスクリーン（screen.ts の LIBRARY_SCREEN）を描く: 帯と、書庫の画面（LibraryView）。
// ブックスクリーンと上下に並べている間（「画面を分割」で下に出したとき）は、帯に「→ 閉じる」と「広げる」を出し（チケットスクリーンと同じ）、
// 書庫の外を押したら引っ込む（ブックスクリーンの編集と、書庫から開く操作を同時にさせない）。引っ込む・広げるときは、ステージを分けて足した空のステージも閉じる。
// 窓いっぱいのときは、帯に名前と閉じるボタン
import { useEffect, useRef } from "react"
import { vacantStagesOf } from "../../../core/window"
import { NO_STAGE } from "../../../store/dialogs"
import { useMessages } from "../../../ui/i18n"
import { useScreenContext } from "../../../ui/screen-context"
import { useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { IconButton } from "../utils/IconButton"
import { BOOK_SCREEN_DEF } from "../window"
import { useScreenSplit } from "../window/useScreenSplit"
import { CLOSE, CLOSE_RIGHT, EXPAND } from "./icons"
import styles from "./LibraryScreen.module.css"
import { LibraryView } from "./LibraryView"
import { emptyStageAbove } from "./screen"

// 書庫から開いて、書庫の外に描かれる物（ダイアログ・右クリックのメニュー・トースト）
const OWN_POPUPS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="status"], [role="alert"]'

export function LibraryScreen() {
  const t = useMessages(kit)
  const split = useScreenSplit()
  const below = split.inSplit && split.defs.includes(BOOK_SCREEN_DEF.id)
  const here = useScreenContext()?.id
  const read = useReadState()
  const { closeStage } = useStoreActions()
  const root = useRef<HTMLDivElement>(null)
  // ステージを分けて足した空のステージを閉じる（何か開かれていれば閉じない）
  const closeEmpty = () => {
    const win = read().window
    const screens = win.screens.map(s => ({ id: s.id, vacant: vacantStagesOf(s) }))
    const stage = here === undefined ? NO_STAGE : emptyStageAbove(screens, win.arrangementValue, here)
    if (stage !== NO_STAGE) closeStage(stage)
  }
  const leave = () => {
    closeEmpty()
    split.close()
  }
  const expand = () => {
    closeEmpty()
    split.expand()
  }
  // 並べている間は、書庫の外を押したら引っ込む（書庫が開いたダイアログ・右クリックのメニューの中は、書庫の操作として数える）
  const leaveRef = useRef(leave)
  leaveRef.current = leave
  useEffect(() => {
    if (!below) return
    const away = (e: PointerEvent) => {
      const at = e.target instanceof Element ? e.target : null
      if (!at || root.current?.contains(at) || at.closest(OWN_POPUPS)) return
      leaveRef.current()
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [below])
  return (
    <div ref={root} className={styles.screen}>
      <div className={styles.band}>
        {below ? (
          <>
            <button type="button" className={styles.close} onClick={leave}>
              {CLOSE_RIGHT}
              {t("Close library")}
            </button>
            <span className={styles.divider} aria-hidden="true" />
            <IconButton label={t("Expand library")} onClick={expand}>
              {EXPAND}
            </IconButton>
          </>
        ) : (
          <>
            <h2 className={styles.title}>{t("Library")}</h2>
            <IconButton label={t("Close library")} onClick={split.close}>
              {CLOSE}
            </IconButton>
          </>
        )}
      </div>
      <LibraryView className={styles.library} />
    </div>
  )
}
