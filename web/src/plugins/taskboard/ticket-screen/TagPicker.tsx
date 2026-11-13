// チケットスクリーンの頭の行のタグ: 付いたタグのバッヂ（プロジェクトの順）。直せるときは、バッヂの × で外し、「＋」で一覧を開いて、まだ付いていない有効なタグを付ける。
// 一覧は外を押すか Esc で閉じる
import { useEffect, useRef, useState } from "react"
import { useMessages } from "../../../plugin-api/ui"
import type { TagRecord } from "../board/shown"
import { TagBadge } from "../board/TagBadge"
import { PlusIcon } from "../icons"
import { kit } from "../kit"
import styles from "./TagPicker.module.css"

export function TagPicker({
  tags,
  choices,
  canEdit,
  onChange,
}: {
  tags: readonly TagRecord[] // 付いたタグ（プロジェクトの順）
  choices: readonly TagRecord[] // 付けられるタグ（まだ付いていない有効なタグ）
  canEdit: boolean
  onChange: (ids: string[]) => void
}) {
  const t = useMessages(kit)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const ids = tags.map(tag => tag.id)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      setOpen(false)
    }
    // Esc は一覧を閉じるだけにする（窓のキーの操作へは渡さない）
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener("pointerdown", down, true)
    document.addEventListener("keydown", key, true)
    return () => {
      document.removeEventListener("pointerdown", down, true)
      document.removeEventListener("keydown", key, true)
    }
  }, [open])
  return (
    <span ref={ref} className={styles.tags}>
      {tags.map(tag => (
        <TagBadge
          key={tag.id}
          tag={tag}
          {...(canEdit
            ? {
                removeLabel: t("Remove the tag {name}", { name: tag.name }),
                onRemove: () => onChange(ids.filter(id => id !== tag.id)),
              }
            : {})}
        />
      ))}
      {canEdit && choices.length > 0 ? (
        <button
          type="button"
          className={styles.add}
          aria-label={t("Attach a tag")}
          title={t("Attach a tag")}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          <PlusIcon />
        </button>
      ) : null}
      {open ? (
        <span className={styles.list} role="dialog" aria-label={t("Attach a tag")}>
          {choices.map(tag => (
            <button
              key={tag.id}
              type="button"
              className={styles.choice}
              onClick={() => {
                setOpen(false)
                onChange([...ids, tag.id])
              }}
            >
              <TagBadge tag={tag} />
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
