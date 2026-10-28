// ブックの名前のボタン（ウィジェット book-name）: ステージのブックの名前を出す。
// ロック中のブックは名前の左に鍵を出し、押すとロックを外す（コマンド book-unlock）。
// 乗せるか押すと、上にメニュー（配置のメニュー stage-menu）がせり上がり、ボタンとメニューから離れると下がる。メニューの項目はコマンドを呼ぶ
import { useEffect, useRef, useState } from "react"
import { bookTitle } from "../../../core/book"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { type MenuCommandId, type MenuItem, menuCommands } from "../../../ui/layout"
import { useMenu, useMenuCommand } from "../../../ui/menu"
import { useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { BOOK_UNLOCK_COMMAND } from "../lock"
import { LockIcon } from "../lock/LockIcon"
import styles from "./BookName.module.css"
import { STAGE_MENU } from "./menu"

// 離れてからメニューが下がるまで（ボタンとメニューの間を動く間に下がらないように）
const LEAVE_MS = 250

export function BookName({ stage }: { stage: string }) {
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const lang = useMatomezuState(s => s.settings.lang)
  const current = useMatomezuState(s => s.workspace.current === stage)
  const t = useMessages(kit)
  const unlock = useCommand(stage, BOOK_UNLOCK_COMMAND.id)
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
  const catalog = useCatalog().core
  const title = book ? bookTitle(catalog, book, lang) : ""
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: マウスが乗ったかを見るだけで、操作は中のボタンが受ける */}
      <div className={styles.name} onMouseEnter={show} onMouseLeave={hide}>
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
          <button
            type="button"
            className={styles.lock}
            aria-label={t("Unlock book")}
            title={t("Locked")}
            disabled={!unlock.shown}
            onClick={() => unlock.run()}
          >
            <LockIcon />
          </button>
        )}
        <StageMenu
          stage={stage}
          open={open}
          onPick={() => {
            cancelLeave()
            setOpen(false)
          }}
        />
      </div>
    </>
  )
}

// せり上がるメニュー。閉じている間は見えず、押せず、読み上げにも出ない
function StageMenu({ stage, open, onPick }: { stage: string; open: boolean; onPick: () => void }) {
  const items = useMenu(STAGE_MENU)
  return (
    <div className={styles.menu} data-open={open} aria-hidden={!open} inert={!open}>
      {items.map(item => (
        <MenuEntry key={menuCommands(item).join(" ")} stage={stage} item={item} onPick={onPick} />
      ))}
    </div>
  )
}

// 項目 1 つ。切り替えなら出ているコマンドを出し、どれも出ていなければ描かない
function MenuEntry({ stage, item, onPick }: { stage: string; item: MenuItem; onPick: () => void }) {
  const id = useMenuCommand(stage, item)
  return id ? <MenuButton stage={stage} id={id} onPick={onPick} /> : null
}

// コマンドのボタン。アイコンが無ければ名前を出し、押されている状態はコマンドの active、押せるかは enabled
function MenuButton({ stage, id, onPick }: { stage: string; id: MenuCommandId; onPick: () => void }) {
  const command = useCommand(stage, id)
  const icon = useUiCatalog().commandIcons.get(id)
  const t = useMessages(kit)
  return (
    <button
      type="button"
      className={styles.item}
      aria-label={t(command.title)}
      aria-pressed={command.active}
      disabled={!command.enabled}
      onClick={() => {
        command.run()
        onPick()
      }}
    >
      {icon ?? t(command.title)}
    </button>
  )
}
