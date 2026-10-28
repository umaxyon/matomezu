// 本文の入力Form: 上の辺に枠のつながった装飾のボックス（RichBar）を付けたテキストエリア
import { useRef } from "react"
import { controlClass } from "../dialog-host/FormParts"
import { RichBar } from "./RichBar"
import styles from "./RichBody.module.css"

export function RichBody({
  id,
  stage,
  value,
  rows,
  maxLength,
  onChange,
}: {
  id: string
  stage: string // 色を決めるブックを開いているステージ
  value: string
  rows: number
  maxLength: number
  onChange: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  return (
    <div className={styles.joined}>
      <RichBar
        stage={stage}
        target={ref}
        value={value}
        maxLength={maxLength}
        onChange={onChange}
        className={styles.top}
      />
      <textarea
        ref={ref}
        id={id}
        className={`${controlClass} ${styles.area}`}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
