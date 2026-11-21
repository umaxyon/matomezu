// 伝言を書く所の部品（右サイドパネルで使う）: 文のテキストForm
import { useEffect, useLayoutEffect, useRef } from "react"
import { NOTE_TEXT_KEY_SCOPE } from "."
import styles from "./NoteForm.module.css"

// 文のテキストForm: 幅は置いた所の幅で折り返し、4 行の高さから、書いた分だけ下へ伸びる。名乗る範囲 NOTE_TEXT_KEY_SCOPE の Mod+Enter で送る（コマンド note-send）
export function GrowingText({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  readOnly,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  autoFocus?: boolean
  readOnly?: boolean
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
  return (
    <textarea
      ref={ref}
      className={styles.text}
      rows={4}
      readOnly={readOnly}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={e => onChange(e.target.value)}
      data-key-scope={NOTE_TEXT_KEY_SCOPE.id}
    />
  )
}
