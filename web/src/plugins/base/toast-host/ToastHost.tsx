// トーストの置き場（ウィジェット toast-host）: store の出しているトースト（toasts）を、画面の下の真ん中に、古いものを上にして積む。
// 種類ごとの出しておく時間（store の TOAST_MS）が過ぎるか、押すと消える
import { useEffect } from "react"
import { TOAST_MS, type Toast } from "../../../store/store"
import { useMessages } from "../../../ui/i18n"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import styles from "./ToastHost.module.css"

export function ToastHost() {
  const toasts = useMatomezuState(s => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className={styles.toasts}>
      {toasts.map(t => (
        <ToastView key={t.id} toast={t} />
      ))}
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
      role={toast.kind === "info" ? "status" : "alert"}
      onClick={() => dismissToast(toast.id)}
    >
      {t(toast.message, toast.params)}
    </button>
  )
}
