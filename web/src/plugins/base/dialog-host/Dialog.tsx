// ダイアログ: 描いている間、画面の上に出し、ほかの操作を止める。Esc か外側を押すと閉じる（onClose）。
// aside は見出しのすぐ右に置く物、actions は見出しの行の右に並べる物（ボタンなど。何を置くかは使う側が決める）。開くと、中身の最初の入力Form（選択肢のボタンは除く）に焦点を当てる。
// 開いたときの上辺の位置を保ち、中身が増えたり減ったりしても下へ伸び縮みする（画面の下に入らなければ、入るだけ上へずらす）。
// height を渡すと、ダイアログの高さをその高さ（画面に収まらなければ画面の高さ）に決め、中身が増えても大きさを変えない（入らない分は中身だけスクロール。見出しの行は動かない）。
// 決める・閉じるキー（既定は Enter・Escape）はキーの割り当てが受け、決めるように頼まれたら（store の dialog.submitted）中身の form を送る
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react"
import { useMatomezuState } from "../../../ui/store-context"
import styles from "./Dialog.module.css"

// 上辺をずらすときに残す、画面の上下の端との間
const EDGE = 16

export function Dialog({
  title,
  aside,
  actions,
  height,
  width,
  onClose,
  children,
}: {
  title: string
  aside?: ReactNode
  actions?: ReactNode
  height?: number // ダイアログの高さ（px）
  width?: number // ダイアログの幅（px。無ければ 360。画面に収まらなければ画面の幅）
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const unmounting = useRef(false) // 描くのをやめるときに自分で閉じている間
  const submitted = useMatomezuState(s => s.dialog?.submitted ?? 0)
  useEffect(() => {
    if (submitted > 0) ref.current?.querySelector("form")?.requestSubmit()
  }, [submitted])
  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    unmounting.current = false
    if (!d.open) {
      d.showModal()
      d.querySelector<HTMLElement>(
        `.${styles.content} :is(input:not([type="radio"]), textarea, select, [contenteditable])`,
      )?.focus()
    }
    const top = d.getBoundingClientRect().top // 真ん中に開いたときの上辺
    const keep = () => {
      d.style.marginTop = `${Math.max(EDGE, Math.min(top, window.innerHeight - d.offsetHeight - EDGE))}px`
    }
    keep()
    const sizes = new ResizeObserver(keep)
    sizes.observe(d)
    return () => {
      sizes.disconnect()
      unmounting.current = true
      d.close()
    }
  }, [])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 外側を押して閉じるのはポインタの操作で、閉じるキーはキーの割り当て（dialog-close）が受ける
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      // 自分で閉じたときの知らせは、閉じたことにしない。知らせはすぐ届くことも後から届くこともあり、
      // 後から届いたときにもう開き直していれば（StrictMode が描き直したときなど）それも閉じたことにしない
      onClose={e => {
        if (!unmounting.current && !e.currentTarget.open) onClose()
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      // 閉じるのはキーの割り当て（dialog-close）が受ける。ブラウザ自身の閉じ方（cancel）は止める
      onCancel={e => e.preventDefault()}
    >
      <div
        className={styles.body}
        data-fixed={height !== undefined}
        style={{
          ...(height === undefined ? {} : { height: `min(${height}px, calc(100vh - 32px))` }),
          ...(width === undefined ? {} : { width: `min(${width}px, calc(100vw - 32px))` }),
        }}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {aside}
          {actions && <div className={styles.headActions}>{actions}</div>}
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </dialog>
  )
}
