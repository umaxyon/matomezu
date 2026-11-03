// 伝言を書く所の部品（下書きの吹き出しと右サイドパネルで使う）: 文のテキストForm と「伝わったら自動で消す」
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import styles from "./NoteForm.module.css"

// 文のテキストForm: 幅は置いた所の幅で折り返し、書いた分だけ下へ伸びる。Ctrl（Mac は Cmd）+Enter で送り、Esc で onEscape を呼ぶ
export function GrowingText({
  value,
  onChange,
  onSubmit,
  onEscape,
  placeholder,
  label,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onEscape?: () => void
  placeholder: string
  label: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 文が変わるたびに高さを測り直す
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  // 右クリックのメニューで「AIに伝言」を選んだら、すぐ書ける（スタンドは測り終えるまで隠れているので、見えてから焦点を入れる）
  useEffect(() => {
    if (!autoFocus) return
    let frame = 0
    const tryFocus = () => {
      const el = ref.current
      if (!el) return
      el.focus()
      if (document.activeElement !== el) frame = requestAnimationFrame(tryFocus)
    }
    tryFocus()
    return () => cancelAnimationFrame(frame)
  }, [autoFocus])
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSubmit()
    } else if (e.key === "Escape") onEscape?.()
  }
  return (
    <textarea
      ref={ref}
      className={styles.text}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

// 「伝わったら自動で消す」のチェックボックス
export function RemoveOnRead({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const t = useMessages(kit)
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {t("Remove once read")}
    </label>
  )
}
