// 書庫のスクリーン（screen.ts の LIBRARY_SCREEN）を描く: 帯と、書庫の画面（LibraryView）。
// ブックスクリーンと上下に並べている間（「画面を分割」で下に出したとき）は、帯に「→ 閉じる」と「広げる」を出し（チケットスクリーンと同じ）、
// 書庫の外を押す・焦点が書庫の外へ移ると閉じる（ブックスクリーンの編集と、書庫から開く操作を同時にさせない。書庫が開いたダイアログ・メニュー・トーストは書庫の内に数える。
// 窓ごと焦点を失ったときは閉じない）。窓いっぱいのときは、帯に名前と閉じるボタン。閉じる・広げるは screen.ts の関数を通る
import { useEffect, useRef } from "react"
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
  // 窓が低くて、下に出す代わりに窓いっぱいに出している間は、広げる物が無い
  const low = !split.tall
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
  // 並べている間は、書庫の外を押したら・焦点が書庫の外の物へ移ったら閉じる（書庫が開いたダイアログ・メニュー・トーストは外に数えない。
  // 窓ごと焦点を失ったときは、移った先が無いので閉じない）
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const el = root.current
    if (!below || !el) return
    const outside = (at: EventTarget | null) => at instanceof Element && !el.contains(at) && !at.closest(POPUP_KEEPS)
    // 閉じる押しは、そこで止める（下の物には届けない。続く click も止める）
    const swallow = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }
    const pressed = (e: PointerEvent) => {
      if (!outside(e.target)) return
      swallow(e)
      window.addEventListener("click", swallow, { capture: true, once: true })
      window.addEventListener("pointerdown", () => window.removeEventListener("click", swallow, true), { once: true })
      closeRef.current()
    }
    const left = (e: FocusEvent) => {
      if (outside(e.relatedTarget)) closeRef.current()
    }
    document.addEventListener("pointerdown", pressed, true)
    el.addEventListener("focusout", left)
    return () => {
      document.removeEventListener("pointerdown", pressed, true)
      el.removeEventListener("focusout", left)
    }
  }, [below])
  return (
    <div ref={root} className={styles.screen}>
      <div className={styles.band}>
        {below ? (
          <>
            <button type="button" className={styles.close} onClick={close}>
              {CLOSE_RIGHT}
              {t("Close library")}
            </button>
            {low ? null : (
              <>
                <span className={styles.divider} aria-hidden="true" />
                <IconButton label={t("Expand library")} onClick={expand}>
                  {EXPAND}
                </IconButton>
              </>
            )}
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
