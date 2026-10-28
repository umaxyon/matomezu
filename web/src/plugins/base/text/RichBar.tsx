// 装飾のボックス: 太字のボタンと、文字の色の丸・色なし。押すと、入力Form target の選んだ範囲を記号で囲む（もう囲んでいれば外す。
// 範囲が無ければカーソルの所に記号の組を入れる。edit.ts）。押しても入力Form から焦点を外さない（その場の編集は焦点が外れると終わるため）。
// 色の丸は効いている色（ステージが開いているブックの上書きと、見る人の上書き）
import { type CSSProperties, type RefObject, useMemo } from "react"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { type Decoration, decorate } from "./edit"
import styles from "./RichBar.module.css"
import { textColorRef } from "./rich"
import { textColorsOf } from "./text-colors"

export function RichBar({
  stage,
  target,
  value,
  maxLength,
  onChange,
  className,
  style,
}: {
  stage: string // 色を決めるブックを開いているステージ
  target: RefObject<HTMLTextAreaElement | HTMLInputElement | null>
  value: string
  maxLength: number
  onChange: (text: string) => void
  className?: string
  style?: CSSProperties
}) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const viewer = useMatomezuState(s => s.settings.textColors)
  const colors = useMemo(() => (book ? textColorsOf(catalog, book, viewer) : null), [catalog, book, viewer])
  const apply = (d: Decoration) => {
    const el = target.current
    if (!el) return
    const done = decorate(value, el.selectionStart ?? value.length, el.selectionEnd ?? value.length, d)
    if (done.text.length > maxLength) return
    onChange(done.text)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(done.start, done.end)
    })
  }
  // 押しても焦点を移さない
  const keep = (e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault()
    e.stopPropagation()
  }
  return (
    <div
      className={className ? `${styles.bar} ${className}` : styles.bar}
      style={style}
      role="toolbar"
      aria-label={t("Body decoration")}
      onPointerDown={keep}
      onMouseDown={keep}
    >
      <button
        type="button"
        className={styles.bold}
        title={t("Bold")}
        aria-label={t("Bold")}
        onClick={() => apply({ bold: true })}
      >
        B
      </button>
      <span className={styles.gap} />
      {[...catalog.textColors.values()].map(c => (
        <button
          key={c.id}
          type="button"
          className={styles.dot}
          title={t(c.title)}
          aria-label={t(c.title)}
          style={{ background: colors?.get(c.id) ?? c.color }}
          onClick={() => apply({ color: textColorRef(c.id) })}
        />
      ))}
      <button
        type="button"
        className={`${styles.dot} ${styles.none}`}
        title={t("No color")}
        aria-label={t("No color")}
        onClick={() => apply({ color: null })}
      />
    </div>
  )
}
