// レーンのチケットの並べ方のトレイ: 項目（id・優先度・最終更新・タグ）ごとに、使うかのチェック・昇順と降順の切り替え。
// 行の左のつまみのドラッグで項目の順を変え、上の項目から順に比べる（例: タグを上・優先度の降順を下にすると、タグごとの優先度の降順）。外を押すか Esc で閉じる
import { useEffect, useRef } from "react"
import { useMessages } from "../../plugin-api/ui"
import { Grip } from "./Grip"
import { kit } from "./kit"
import { moved } from "./reorder"
import styles from "./SortTray.module.css"
import type { SortRule, SortRules } from "./sort"
import { useGripDrag } from "./useGripDrag"

export function SortTray({
  rules,
  opener,
  onChange,
  onClose,
}: {
  rules: SortRules
  opener: HTMLElement | null // 開いたボタン（押しても外とは見ない）
  onChange: (rules: SortRules) => void
  onClose: () => void
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const { dragRowProps, gripProps } = useGripDrag((dragging, over) => {
    const from = rules.find(r => r.key === dragging)
    const to = rules.find(r => r.key === over)
    if (from && to) onChange(moved(rules, from, to))
  })
  const change = (key: SortRule["key"], patch: Partial<SortRule>) =>
    onChange(rules.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const nameOf = (key: SortRule["key"]) =>
    t(key === "id" ? "sort id" : key === "priority" ? "sort priority" : key === "updated" ? "sort updated" : "sort tag")

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.target instanceof Node && (ref.current?.contains(e.target) || opener?.contains(e.target))) return
      onClose()
    }
    // Esc はトレイを閉じるだけにする（窓のキーの操作（画面を戻すなど）へは渡さない）
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener("pointerdown", down, true)
    document.addEventListener("keydown", key, true)
    return () => {
      document.removeEventListener("pointerdown", down, true)
      document.removeEventListener("keydown", key, true)
    }
  }, [opener, onClose])

  return (
    <div ref={ref} className={styles.tray} role="dialog" aria-label={t("Sort cards")}>
      {rules.map(r => (
        <div key={r.key} className={styles.row} data-on={r.on} {...dragRowProps(r.key)}>
          <Grip {...gripProps(r.key)} />
          <label className={styles.name}>
            <input type="checkbox" checked={r.on} onChange={e => change(r.key, { on: e.target.checked })} />
            {nameOf(r.key)}
          </label>
          <button
            type="button"
            className={styles.dir}
            aria-label={t("Direction of {name}", { name: nameOf(r.key) })}
            onClick={() => change(r.key, { desc: !r.desc, on: true })}
          >
            {r.desc ? t("sort descending") : t("sort ascending")}
          </button>
        </div>
      ))}
    </div>
  )
}
