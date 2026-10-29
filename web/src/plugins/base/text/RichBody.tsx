// 本文の入力Form: 上の辺に枠のつながった装飾のボックス（RichBar）を付けた、複数行の見たまま編集の入力Form（RichInput）。高さは rows 行分から、縦にだけ伸ばせる
import { useRef } from "react"
import { controlClass } from "../dialog-host/FormParts"
import { RichBar } from "./RichBar"
import styles from "./RichBody.module.css"
import { RichInput, type RichInputHandle } from "./RichInput"

export function RichBody({
  id,
  stage,
  label,
  value,
  rows,
  maxLength,
  onChange,
}: {
  id: string
  stage: string // 色を決めるブックを開いているステージ
  label: string
  value: string
  rows: number
  maxLength: number
  onChange: (text: string) => void
}) {
  const ref = useRef<RichInputHandle>(null)
  return (
    <div className={styles.joined}>
      <RichBar stage={stage} target={ref} className={styles.top} />
      <RichInput
        ref={ref}
        stage={stage}
        id={id}
        label={label}
        multiline
        className={`${controlClass} ${styles.area}`}
        style={{ height: `calc(${rows}lh + 16px)` }}
        maxLength={maxLength}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}
