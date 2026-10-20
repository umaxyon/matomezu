// ステージの下の行: 左端にブックの名前の欄、その右にページのタブ。
// 名前の欄にマウスを乗せるか押すと、上にメニュー（マスター・画面の分割・ブックを開く）がせり上がり、欄とメニューから離れると下がる
import { useEffect, useRef, useState } from "react"
import { bookTitle } from "../../core/book"
import { OpenBookDialog } from "../book-search/OpenBookDialog"
import { useT } from "../i18n"
import { useActions, useApp } from "../store-context"
import { PageTabs } from "../tabs/PageTabs"
import styles from "./StageFooter.module.css"

// 離れてからメニューが下がるまで（欄とメニューの間を動く間に下がらないように）
const LEAVE_MS = 250

export function StageFooter({ stage }: { stage: string }) {
  const book = useApp(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const lang = useApp(s => s.settings.lang)
  const t = useT()
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
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
  const title = book ? bookTitle(book, lang) : ""
  return (
    <div className={styles.footer}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: マウスが乗ったかを見るだけで、操作は中のボタンが受ける */}
      <div className={styles.name} onMouseEnter={show} onMouseLeave={hide}>
        <button
          type="button"
          className={styles.trigger}
          aria-label={title || t("ブックのメニュー")}
          aria-expanded={open}
          title={title || undefined}
          onClick={show}
        >
          {title}
        </button>
        <StageMenu
          stage={stage}
          open={open}
          onPick={() => {
            cancelLeave()
            setOpen(false)
          }}
          onOpenBook={() => setPicking(true)}
        />
      </div>
      <PageTabs stage={stage} />
      <OpenBookDialog stage={stage} open={picking} onClose={() => setPicking(false)} />
    </div>
  )
}

// せり上がるメニュー。閉じている間は見えず、押せず、読み上げにも出ない
function StageMenu({
  stage,
  open,
  onPick,
  onOpenBook,
}: {
  stage: string
  open: boolean
  onPick: () => void
  onOpenBook: () => void
}) {
  const isSplit = useApp(s => s.workspace.stages.length > 1)
  const onMaster = useApp(s => s.workspace.stages.find(st => st.id === stage)?.opened?.type === "master")
  const { split, unsplit, openMaster } = useActions()
  const t = useT()
  const pick = (run: () => void) => () => {
    run()
    onPick()
  }
  return (
    <div className={styles.menu} data-open={open} aria-hidden={!open} inert={!open}>
      <button
        type="button"
        className={styles.item}
        aria-label={t("マスター")}
        aria-pressed={onMaster}
        onClick={pick(() => openMaster(stage))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11 12 4l8 7" />
          <path d="M6 9.5V20h12V9.5" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.item}
        aria-label={t("画面を分割")}
        aria-pressed={isSplit}
        onClick={pick(() => (isSplit ? unsplit(stage) : split(stage)))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M12 5v14" />
        </svg>
      </button>
      <button type="button" className={styles.item} aria-label={t("ブックを開く")} onClick={pick(onOpenBook)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 5.5h6l2 2h9v11h-17z" />
        </svg>
      </button>
    </div>
  )
}
