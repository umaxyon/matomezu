// ブックの名前のボタン（ウィジェット book-name）: ステージのブックの名前を出す。
// ロック中のブックは名前の左に鍵を出す（印だけ。外すのはブックの設定のダイアログ）。
// 乗せるか押すと、下の行の真上に、行の幅いっぱいのドロワーが下から上がり、離れると下がる。下の行に置かれていれば、下の行のどこに乗せても出し、
// 下の行から離れると下がる（ドロワーは下の行の中に描くので、ドロワーに乗っている間も下の行に乗っている）。
// ドロワーには、左から地図・基本・ブックの道具の 3 つのスロット（drawer.ts）を、仕切りの線で分けて並べる（何も描かれないスロットは詰める）。
// 中のウィジェットは、項目を選んだらドロワーを下げられる（drawer-context.tsx）
import { useEffect, useRef, useState } from "react"
import { bookTitle } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import { Slot } from "../../../ui/Slot"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { LockIcon } from "../lock/LockIcon"
import { useBottomHover } from "../workspace/bottom-hover"
import styles from "./BookName.module.css"
import { DRAWER_SLOTS } from "./drawer"
import { DrawerContext } from "./drawer-context"

// 離れてからメニューが下がるまで（ボタンとメニューの間を動く間に下がらないように）
const LEAVE_MS = 250

export function BookName({ stage }: { stage: string }) {
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const lang = useMatomezuState(s => s.lang)
  const current = useMatomezuState(s => s.workspace.current === stage)
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
  const catalog = useCatalog().core
  const title = book ? bookTitle(catalog, book, lang) : ""
  return (
    <>
      <div className={styles.name} {...own}>
        <button
          type="button"
          className={styles.trigger}
          data-current={current}
          data-locked={book?.locked === true}
          aria-label={title || t("Book menu")}
          aria-haspopup="menu"
          aria-expanded={open}
          title={title || undefined}
          onClick={show}
        >
          {title}
        </button>
        {book?.locked && (
          <span className={styles.lock} role="img" aria-label={t("Locked")}>
            <LockIcon />
          </span>
        )}
      </div>
      <Drawer
        stage={stage}
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

// 下から上がるドロワー。閉じている間は見えず、押せず、読み上げにも出ない。own は下の行の外に置かれたときの、乗ったかを見る受け取り
function Drawer({
  stage,
  open,
  own,
  onPick,
}: {
  stage: string
  open: boolean
  own: { onMouseEnter?: () => void; onMouseLeave?: () => void }
  onPick: () => void
}) {
  return (
    <div className={styles.drawer} data-open={open} aria-hidden={!open} inert={!open} {...own}>
      <DrawerContext.Provider value={onPick}>
        <div className={styles.row}>
          {DRAWER_SLOTS.map(name => (
            <div key={name} className={styles.part}>
              <Slot name={name} props={{ stage }} />
            </div>
          ))}
        </div>
      </DrawerContext.Provider>
    </div>
  )
}
