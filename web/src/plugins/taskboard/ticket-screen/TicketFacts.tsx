// チケットスクリーンの左の枠の項目: 題と値の組・チケットの名前（鉛筆で直す）・段を選ぶスライダー（優先度・チケットボリューム）
import { type KeyboardEvent, useState } from "react"
import { useMessages } from "../../../plugin-api/ui"
import { IconButton } from "../../base/ui"
import { PencilIcon } from "../icons"
import { kit } from "../kit"
import { TICKET_NAME_MAX } from "../ticket"
import styles from "./TicketScreen.module.css"

export function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <span>
      <span className={styles.factName}>{name}</span>
      {children}
    </span>
  )
}

// チケットの名前: 鉛筆で直す。Enter かフォーカスが外れたら決め、Esc でやめる。空なら元の名前に戻す
export function NameField({
  name,
  canEdit,
  onEditing,
  onRename,
}: {
  name: string
  canEdit: boolean
  onEditing: (on: boolean) => void
  onRename: (name: string) => void
}) {
  const t = useMessages(kit)
  const [draft, setDraft] = useState<string | null>(null)
  const finish = (save: boolean) => {
    if (save && draft !== null && draft.trim() !== "" && draft.trim() !== name) onRename(draft.trim())
    setDraft(null)
    onEditing(false)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true)
    if (e.key === "Escape") finish(false)
  }
  return (
    <div className={styles.titleRow}>
      {draft === null ? (
        <>
          <h2 className={styles.name}>{name}</h2>
          {canEdit ? (
            <IconButton
              small
              label={t("Edit the name")}
              onClick={() => {
                setDraft(name)
                onEditing(true)
              }}
            >
              <PencilIcon />
            </IconButton>
          ) : null}
        </>
      ) : (
        <input
          ref={el => el?.focus()}
          type="text"
          className={styles.nameInput}
          aria-label={t("Ticket name")}
          aria-invalid={draft.trim() === ""}
          maxLength={TICKET_NAME_MAX}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => finish(true)}
        />
      )}
    </div>
  )
}

// 段を選ぶスライダー（優先度・チケットボリューム）: 段の数だけ止まる所があり、下に段の名前。つまみを動かしている間は値を持ち、離したとき（キーなら 1 段ごと）に送る
export function StepSlider<T extends string>({
  title,
  steps,
  value,
  nameOf,
  canEdit,
  onChange,
}: {
  title: string
  steps: readonly T[]
  value: T
  nameOf: (step: T) => string
  canEdit: boolean
  onChange: (step: T) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const index = drag ?? steps.indexOf(value)
  const shown = steps[index] ?? value
  const commit = () => {
    const next = drag === null ? undefined : steps[drag]
    setDrag(null)
    if (next !== undefined && next !== value) onChange(next)
  }
  return (
    <label className={styles.step}>
      <span className={styles.factName}>{title}</span>
      <span className={styles.slider} style={{ width: `${steps.length * 32}px` }}>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={index}
          disabled={!canEdit}
          aria-valuetext={nameOf(shown)}
          onChange={e => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className={styles.ticks} aria-hidden="true">
          {steps.map((step, i) => (
            <span key={step} data-on={i === index}>
              {nameOf(step)}
            </span>
          ))}
        </span>
      </span>
    </label>
  )
}
