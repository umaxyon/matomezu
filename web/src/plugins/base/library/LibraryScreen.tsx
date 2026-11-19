// 書庫のスクリーン（screen.ts の LIBRARY_SCREEN）を描く: 帯と、書庫の画面（LibraryView）。
// ブックスクリーンと上下に並べている間（「画面を分割」で下に出したとき）は、帯に「→ 閉じる」と「広げる」を出し（チケットスクリーンと同じ）、
// 書庫の外を押す・焦点が書庫の外へ移ると閉じる（ブックスクリーンの編集と、書庫から開く操作を同時にさせない。書庫が開いたダイアログ・メニュー・トーストは書庫の内に数える。
// 窓ごと焦点を失ったときは閉じない）。窓いっぱいのときは、帯に名前と閉じるボタン。閉じる・広げるは screen.ts の関数を通る
import { type FocusEvent, useEffect, useRef } from "react"
import { openScreensOf } from "../../../store/commands"
import { useMessages } from "../../../ui/i18n"
import { useScreenContext } from "../../../ui/screen-context"
import { useReadState, useStoreActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { IconButton } from "../utils/IconButton"
import { POPUP_KEEPS } from "../utils/popup-keeps"
import { BOOK_SCREEN_DEF } from "../window"
import { useScreenSplit } from "../window/useScreenSplit"
import { CLOSE, CLOSE_RIGHT, EXPAND } from "./icons"
import styles from "./LibraryScreen.module.css"
import { LibraryView } from "./LibraryView"
import { closeLibrary, expandLibrary } from "./screen"

export function LibraryScreen() {
  const t = useMessages(kit)
  const split = useScreenSplit()
  const below = split.inSplit && split.defs.includes(BOOK_SCREEN_DEF.id)
  const here = useScreenContext()?.id ?? ""
  const read = useReadState()
  const store = useStoreActions()
  const root = useRef<HTMLDivElement>(null)
  const close = () => {
    const win = read().window
    closeLibrary(store, openScreensOf(win), win.arrangementValue, here)
  }
  const expand = () => {
    const win = read().window
    expandLibrary(store, openScreensOf(win), win.arrangementValue, here)
  }
  // 書庫の外の物か（書庫が開いたダイアログ・メニュー・トーストは外に数えない）
  const outside = (at: Element) => !root.current?.contains(at) && !at.closest(POPUP_KEEPS)
  // 並べている間は、書庫の外を押したら閉じる
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!below) return
    const away = (e: PointerEvent) => {
      if (e.target instanceof Element && outside(e.target)) closeRef.current()
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [below])
  // 並べている間は、焦点が書庫の外の物へ移ったら閉じる（窓ごと焦点を失ったときは、移った先が無いので閉じない）
  const onBlur = (e: FocusEvent) => {
    if (below && e.relatedTarget instanceof Element && outside(e.relatedTarget)) close()
  }
  return (
    <div ref={root} className={styles.screen} onBlur={onBlur}>
      <div className={styles.band}>
        {below ? (
          <>
            <button type="button" className={styles.close} onClick={close}>
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
            <IconButton label={t("Close library")} onClick={close}>
              {CLOSE}
            </IconButton>
          </>
        )}
      </div>
      <LibraryView className={styles.library} />
    </div>
  )
}
