// プロジェクト設定の一覧とプロンプトの左右の分割（チケットタグ・レーン）: 左に行・重なりの知らせ・「〜追加」のボタン、右に選んだ行のプロンプトの入力Form。
// 行は使う側が描き、行の枠には rowProps を付ける（行のどこを押しても選ぶ・選んだ行の色）。行の名前の入力Formには NameInput を使う
import type { ReactNode, Ref } from "react"
import { ActionButton, controlClass } from "../base/ui"
import styles from "./PromptSplit.module.css"

export function rowProps(key: string, selected: string | null, onSelect: (key: string) => void) {
  return { className: styles.row, "data-selected": key === selected, onClick: () => onSelect(key) }
}

// 一覧の行の名前の入力Form: Enter は保存に送らず、入力Formを離れるだけ（離れると使う側が片付ける）。重なっている間は赤い枠
export function NameInput({
  label,
  value,
  max,
  repeated,
  inputRef,
  onFocus,
  onChange,
  onLeave,
}: {
  label: string
  value: string
  max: number
  repeated: boolean
  inputRef?: Ref<HTMLInputElement>
  onFocus: () => void
  onChange: (name: string) => void
  onLeave: () => void
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      className={`${controlClass} ${styles.name}`}
      aria-label={label}
      aria-invalid={repeated}
      maxLength={max}
      value={value}
      onFocus={onFocus}
      onChange={e => onChange(e.target.value)}
      onBlur={onLeave}
      onKeyDown={e => {
        if (e.key !== "Enter") return
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.blur()
      }}
    />
  )
}

export function PromptSplit({
  children,
  notes,
  addLabel,
  onAdd,
  promptTitle,
  prompt,
  onPromptChange,
}: {
  children: ReactNode // 行
  notes: readonly string[] // 一覧の下に出す知らせ（重なりなど）
  addLabel: string
  onAdd: () => void
  promptTitle: string
  prompt: string | undefined // 選んだ行のプロンプト。undefined は、プロンプトを持つ行を選んでいない
  onPromptChange: (prompt: string) => void
}) {
  return (
    <div className={styles.split}>
      <div className={styles.list}>
        {children}
        {notes.map(n => (
          <p key={n} className={styles.note}>
            {n}
          </p>
        ))}
        <div>
          <ActionButton onClick={onAdd}>{addLabel}</ActionButton>
        </div>
      </div>
      <div className={styles.prompt}>
        {prompt !== undefined ? (
          <label className={styles.promptField}>
            <span className={styles.promptTitle}>{promptTitle}</span>
            <textarea
              className={`${controlClass} ${styles.textarea}`}
              value={prompt}
              onChange={e => onPromptChange(e.target.value)}
            />
          </label>
        ) : null}
      </div>
    </div>
  )
}
