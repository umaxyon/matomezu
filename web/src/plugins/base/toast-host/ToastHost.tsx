// トーストの置き場（ウィジェット toast-host）: store の出しているトースト（toasts）を、画面の下の真ん中に、古いものを上にして積む。
// 原因（detail）は 2 行目に出す。種類ごとの出しておく時間（TOAST_MS）が過ぎるか、押すと消える。
// 見せ方がマーキー（form が marquee）の物は、画面の上の真ん中に、決まった幅の帯で 1 つずつ出す: 下りてきて文を右から左へ流し、流し終えたら引っ込んで消える
import { useEffect } from "react"
import type { Toast } from "../../../store/store"
import { useMessages } from "../../../ui/i18n"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import styles from "./ToastHost.module.css"

// トーストを出しておく時間（ms）。null は時間では消さない
const TOAST_MS: Readonly<Record<Toast["kind"], number | null>> = {
  info: 3500,
  success: 3500,
  warn: 7000,
  error: null,
}

export function ToastHost() {
  const toasts = useMatomezuState(s => s.toasts)
  const cards = toasts.filter(t => t.form !== "marquee")
  const marquee = toasts.find(t => t.form === "marquee")
  return (
    <>
      {cards.length > 0 && (
        <div className={styles.toasts}>
          {cards.map(t => (
            <ToastView key={t.id} toast={t} />
          ))}
        </div>
      )}
      {marquee && <Marquee key={marquee.id} toast={marquee} />}
    </>
  )
}

// マーキー: 下りる・流す・引っ込むの動きは CSS が持ち、引っ込み終えたら消す（動きを減らす設定では、動かさずに少し出して消す）
function Marquee({ toast }: { toast: Toast }) {
  const { dismissToast } = useActions()
  const t = useMessages(kit)
  return (
    <div
      className={styles.marquee}
      data-kind={toast.kind}
      role="status"
      onAnimationEnd={e => {
        if (e.target === e.currentTarget) dismissToast(toast.id)
      }}
    >
      <span className={styles.flow}>{t(toast.message, toast.params)}</span>
    </div>
  )
}

function ToastView({ toast }: { toast: Toast }) {
  const { dismissToast } = useActions()
  const t = useMessages(kit)
  useEffect(() => {
    const ms = TOAST_MS[toast.kind]
    if (ms === null) return
    const timer = setTimeout(() => dismissToast(toast.id), ms)
    return () => clearTimeout(timer)
  }, [toast, dismissToast])
  return (
    <button
      type="button"
      className={styles.toast}
      data-kind={toast.kind}
      role={toast.kind === "info" || toast.kind === "success" ? "status" : "alert"}
      onClick={() => dismissToast(toast.id)}
    >
      {t(toast.message, toast.params)}
      {toast.detail && <span className={styles.detail}>{t(toast.detail.message, toast.detail.params)}</span>}
    </button>
  )
}
