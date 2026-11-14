// プロジェクト設定の一覧とプロンプトの左右の分割（チケットタグ・レーン）: 左に「〜追加」のボタン・行（ここだけスクロールする）・重なりの知らせ、右に選んだ行のプロンプトの入力Form。
// 行は使う側が描き、行の枠には rowProps を付ける（行のどこを押しても選ぶ・選んだ行の色）。行の名前には NameField を使う
import { type ReactNode, type RefObject, useState } from "react"
import { ActionButton, controlClass, IconButton } from "../../base/ui"
import { PencilIcon } from "../icons"
import styles from "./PromptSplit.module.css"

export function rowProps(key: string, selected: string | null, onSelect: (key: string) => void, extraClass = "") {
  return { className: `${styles.row} ${extraClass}`, "data-selected": key === selected, onClick: () => onSelect(key) }
}

// 一覧の行の名前: ふだんはラベルと鉛筆のボタンで、鉛筆を押すと入力Formになる（チケットの題と同じ形）。名前が空の行（足したばかりの行）は、最初から入力Form。
// Enter か入力Formを離れると編集を終えて、使う側が片付ける（onLeave）。Esc は直す前の名前に戻して終える。重なっている間は赤い枠（ラベルは赤い字）
export function NameField({
  label,
  editLabel,
  value,
  max,
  repeated,
  inputRef,
  onFocus,
  onChange,
  onLeave,
}: {
  label: string
  editLabel: string
  value: string
  max: number
  repeated: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onFocus: () => void
  onChange: (name: string) => void
  onLeave: () => void
}) {
  const [before, setBefore] = useState<string | null>(null) // 直す前の名前（直している間だけ）
  const [fresh, setFresh] = useState(value === "") // 足したばかりの行（最初に名前が空）は、離れるまで入力Formのまま。打つ途中で値が空でなくなってもラベルに切り替えない
  const editing = before !== null || fresh
  if (!editing) {
    return (
      <span className={styles.nameView}>
        <span className={styles.nameLabel} data-invalid={repeated} title={value}>
          {value}
        </span>
        <IconButton small label={editLabel} onClick={() => setBefore(value)}>
          <PencilIcon />
        </IconButton>
      </span>
    )
  }
  const finish = () => {
    setBefore(null)
    setFresh(false)
    onLeave()
  }
  return (
    <input
      ref={el => {
        if (inputRef) inputRef.current = el
        el?.focus()
      }}
      type="text"
      className={`${controlClass} ${styles.name}`}
      aria-label={label}
      aria-invalid={repeated}
      maxLength={max}
      value={value}
      onFocus={onFocus}
      onChange={e => onChange(e.target.value)}
      onBlur={finish}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return
        if (e.key !== "Enter" && e.key !== "Escape") return
        e.preventDefault()
        e.stopPropagation()
        if (e.key === "Escape") onChange(before ?? "")
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
  promptHead,
  prompt,
  onPromptChange,
}: {
  children: ReactNode // 行
  notes: readonly string[] // 一覧の下に出す知らせ（重なりなど）
  addLabel: string
  onAdd: () => void
  promptTitle: string
  promptHead?: ReactNode // 選んだ行のプロンプトの見出しの上に置く物（レーンの「完了レーンにする」など）
  prompt: string | undefined // 選んだ行のプロンプト。undefined は、プロンプトを持つ行を選んでいない
  onPromptChange: (prompt: string) => void
}) {
  return (
    <div className={styles.split}>
      <div className={styles.listColumn}>
        <div>
          <ActionButton onClick={onAdd}>{addLabel}</ActionButton>
        </div>
        <div className={styles.list}>{children}</div>
        {notes.map(n => (
          <p key={n} className={styles.note}>
            {n}
          </p>
        ))}
      </div>
      <div className={styles.prompt}>
        {prompt !== undefined && promptHead ? <div className={styles.promptHead}>{promptHead}</div> : null}
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
