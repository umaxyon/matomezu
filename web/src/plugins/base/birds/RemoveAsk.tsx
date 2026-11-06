// 押すと「外す？」の小さな吹き出しを出す所（マークと、伝言の付ける先の鳥が使う）。「はい」で onRemove を呼ぶ
import { useEffect, useRef, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import styles from "./RemoveAsk.module.css"

const LEAVE_GRACE = 400 // ポインタが離れてから「外す？」を隠すまでの ms

// 押すと「外す？」の吹き出しを出す所。children は押す物（吹き出しを出し入れする関数を受け取る）。ポインタが離れて少し経つか、ほかを押すと隠す
export function RemoveAsk({
  onRemove,
  onAsking,
  onBird = false,
  below = false,
  children,
}: {
  onRemove: () => void
  onAsking?: (asking: boolean) => void
  onBird?: boolean // 鳥の足元に置く（吹き出しを鳥の上に出す）
  below?: boolean // 吹き出しを押す物の下に出す（角の吹き出しが下へ広がったとき）
  children: (toggle: () => void) => React.ReactNode
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 吹き出しを出し入れしたときだけ知らせる
  useEffect(() => {
    onAsking?.(asking)
  }, [asking])
  useEffect(() => {
    if (!asking) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAsking(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [asking])
  // ポインタが離れたら少し待って隠す（押す物と吹き出しの間の隙間を通って「はい」へ行けるように。戻れば隠さない）
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stay = () => clearTimeout(leaving.current)
  useEffect(() => () => clearTimeout(leaving.current), [])
  return (
    <div
      ref={ref}
      className={onBird ? `${styles.ask} ${styles.onBird}` : below ? `${styles.ask} ${styles.below}` : styles.ask}
      onPointerEnter={stay}
      onPointerLeave={() => {
        stay()
        leaving.current = setTimeout(() => setAsking(false), LEAVE_GRACE)
      }}
    >
      {asking && (
        // biome-ignore lint/a11y/useSemanticElements: 吹き出しは問いとボタンを束ねる箱で、入力Formのまとまり（fieldset）ではない
        <div className={styles.askBubble} role="group" aria-label={t("Remove?")}>
          <span>{t("Remove?")}</span>
          <button type="button" className={styles.yes} onClick={onRemove}>
            {t("Yes")}
          </button>
        </div>
      )}
      {children(() => setAsking(a => !a))}
    </div>
  )
}
