// ブックの名前のボタン（ウィジェット book-name）: ステージのブックの名前（ブックの外のページを開いていれば、そのページの名前。ブックの外のバインダを開いていれば、そのバインダの名前）を出す。
// ロック中のブック（ブックの外のページを開いていれば、ロック中のそのページ）は名前の左に鍵を出す（印だけ。外すのはブック・ページの設定のダイアログ）。
// ブックの外のバインダはロックを持たないので、鍵を出さない（ロックしたページは、ページ一覧に鍵を出す）。
// 乗せるか押すと、下の行の真上に、行の幅いっぱいのフッタメニューが下から上がり、離れると下がる。下の行に置かれていれば、下の行のどこに乗せても出し、
// 下の行から離れると下がる（フッタメニューは下の行の中に描くので、フッタメニューに乗っている間も下の行に乗っている）。
// フッタメニューには、左から地図・履歴・基本・ブックの道具の 4 つのスロット（footer-menu.ts の FOOTER_MENU_SLOTS）を、仕切りの線で分けて並べる（何も描かれないスロットは詰める）。
// 中のウィジェットは、項目を選んだらフッタメニューを下げられる（footer-menu-context.tsx）

import { useEffect, useRef, useState } from "react"
import { NO_PAGE } from "../../../core/stage"
import { workspaceOf } from "../../../core/window"
import { NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { useMessages } from "../../../ui/i18n"
import { Slot } from "../../../ui/Slot"
import { useStageHere } from "../../../ui/scope"
import { useBook, useOutsideBinder, usePage } from "../../../ui/view-hooks"
import { FOOTER_MENU_SLOTS } from "../footer-menu/footer-menu"
import { FooterMenuContext } from "../footer-menu/footer-menu-context"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { useBottomHover } from "../workspace/bottom-hover"
import styles from "./BookName.module.css"

// 離れてからメニューが下がるまで（ボタンとメニューの間を動く間に下がらないように）
const LEAVE_MS = 250

export function BookName() {
  const shownBook = useBook()
  const book = shownBook === NO_BOOK ? undefined : shownBook
  const shownBinder = useOutsideBinder()
  const binder = shownBinder === NO_OUTSIDE_BINDER ? undefined : shownBinder // ブックの外のバインダを開いていれば、名前はそのバインダの名前
  const shownPage = usePage()
  const page = shownPage === NO_PAGE ? undefined : shownPage // ブックの外のページを開いていれば、名前はそのページの名前
  const current = useStageHere((st, s) => st !== null && workspaceOf(s.window, st.id).current === st.id)
  const t = useMessages(kit)
  const [open, setOpen] = useState(false)
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelLeave = () => {
    if (leave.current) clearTimeout(leave.current)
    leave.current = null
  }
  useEffect(
    () => () => {
      if (leave.current) clearTimeout(leave.current)
    },
    [],
  )
  const show = () => {
    cancelLeave()
    setOpen(true)
  }
  const hide = () => {
    cancelLeave()
    leave.current = setTimeout(() => setOpen(false), LEAVE_MS)
  }
  // 下の行に置かれていれば、下の行に乗ったかで出し下げする（名前のボタンだけを見ない）
  const bottom = useBottomHover()
  const toggles = useRef({ show, hide })
  toggles.current = { show, hide }
  useEffect(() => {
    if (bottom === null) return
    if (bottom > 0) toggles.current.show()
    else toggles.current.hide()
  }, [bottom])
  const own = bottom === null ? { onMouseEnter: show, onMouseLeave: hide } : {}
  const title = (book ?? binder ?? page)?.title ?? ""
  const locked = !binder && (book ?? page)?.locked === true
  return (
    <>
      <div className={styles.name} {...own}>
        <button
          type="button"
          className={styles.trigger}
          data-current={current}
          data-locked={locked}
          aria-label={title || t("Book menu")}
          aria-haspopup="menu"
          aria-expanded={open}
          title={title || undefined}
          onClick={show}
        >
          {title}
        </button>
        {locked && (
          <span className={styles.lock} role="img" aria-label={t("Locked")}>
            <LockIcon />
          </span>
        )}
      </div>
      <FooterMenu
        open={open}
        own={own}
        onPick={() => {
          cancelLeave()
          setOpen(false)
        }}
      />
    </>
  )
}

// 下から上がるフッタメニュー。閉じている間は見えず、押せず、読み上げにも出ない。own は下の行の外に置かれたときの、乗ったかを見る受け取り
function FooterMenu({
  open,
  own,
  onPick,
}: {
  open: boolean
  own: { onMouseEnter?: () => void; onMouseLeave?: () => void }
  onPick: () => void
}) {
  return (
    <div className={styles.footerMenu} data-open={open} aria-hidden={!open} inert={!open} {...own}>
      <FooterMenuContext.Provider value={onPick}>
        <div className={styles.row}>
          {FOOTER_MENU_SLOTS.map(name => (
            <div key={name} className={styles.part}>
              <Slot name={name} props={{}} />
            </div>
          ))}
        </div>
      </FooterMenuContext.Provider>
    </div>
  )
}
