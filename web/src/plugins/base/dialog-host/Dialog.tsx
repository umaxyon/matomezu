// ダイアログ: 描いている間、画面の上に出し、ほかの操作を止める。Esc か外側を押すと閉じる（onClose）。
// aside は見出しのすぐ右に置く物、actions は見出しの行の右に並べる物（ボタンなど。何を置くかは使う側が決める）。開くと、中身の最初の入力Form（選択肢のボタンは除く）に焦点を当てる。
// 開いたときの上辺の位置を保ち、中身が増えたり減ったりしても下へ伸び縮みする（画面の下に入らなければ、入るだけ上へずらす）。
// height を渡すと、ダイアログの高さをその高さ（画面に収まらなければ画面の高さ）に決め、中身が増えても大きさを変えない（入らない分は中身だけスクロール。見出しの行は動かない）。
// large なら、幅も高さも窓の 90% に決める（大きな絵の上で操作するダイアログ。width・height より先）。
// 決める・閉じるキー（既定は Enter・Escape）はキーバインドが受け、決めるように頼まれたら（store の dialog.submitted）中身の form を送る。
// docked なら、窓の右の端に寄せて後ろを暗くせず、ほかの操作を止めない（ダイアログを見ながら図を動かせるように）
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
  large = false,
  docked = false,
  onClose,
  children,
}: {
  title: string
  aside?: ReactNode
  actions?: ReactNode
  height?: number // ダイアログの高さ（px）
  large?: boolean // 幅も高さも窓の 90% にする
  docked?: boolean // 窓の右の端に寄せ、ほかの操作を止めない
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
    // 右の端に寄せている間は、上辺を保たない（寄せた所に置く）
    const keep = () => {
      if (d.dataset.docked === "true") return
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
  // 外側を押して閉じるのは、押し始めも外側のときだけ（中の字をドラッグで選んで外で離したときは閉じない）
  const pressedOutside = useRef(false)
  // 寄せるときは、ほかの操作を止めない開き方に、戻すときは止める開き方に開き直す（開き直す間の閉じた知らせは、閉じたことにしない）
  const wasDocked = useRef(docked)
  useLayoutEffect(() => {
    const d = ref.current
    if (!d || wasDocked.current === docked) return
    wasDocked.current = docked
    unmounting.current = true
    d.close()
    d.style.marginTop = ""
    if (docked) d.show()
    else d.showModal()
    unmounting.current = false
  }, [docked])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 外側を押して閉じるのはポインタの操作で、閉じるキーはキーバインド（dialog-close）が受ける
    <dialog
      ref={ref}
      className={styles.dialog}
      data-docked={docked}
      aria-label={title}
      // 自分で閉じたときの知らせは、閉じたことにしない。知らせはすぐ届くことも後から届くこともあり、
      // 後から届いたときにもう開き直していれば（StrictMode が描き直したときなど）それも閉じたことにしない
      onClose={e => {
        if (!unmounting.current && !e.currentTarget.open) onClose()
      }}
      onPointerDown={e => {
        pressedOutside.current = e.target === e.currentTarget
      }}
      onClick={e => {
        if (e.target === e.currentTarget && pressedOutside.current) onClose()
      }}
      // 閉じるのはキーバインド（dialog-close）が受ける。ブラウザ自身の閉じ方（cancel）は止める
      onCancel={e => e.preventDefault()}
    >
      <div
        className={styles.body}
        data-fixed={large || height !== undefined}
        style={
          large
            ? { width: "90vw", height: "90vh" }
            : {
                ...(height === undefined ? {} : { height: `min(${height}px, calc(100vh - 32px))` }),
                ...(width === undefined ? {} : { width: `min(${width}px, calc(100vw - 32px))` }),
              }
        }
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
