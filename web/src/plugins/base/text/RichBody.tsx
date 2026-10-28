// 本文の入力Form: 上の辺に枠のつながった装飾のボックス（太字のボタンと、文字の色の丸・色なし）を付けたテキストエリア。
// 押すと、選んだ範囲を記号で囲む（もう囲んでいれば外す。範囲が無ければカーソルの所に記号の組を入れる。edit.ts）。色の丸は効いている色（ステージが開いているブックの上書きと、見る人の上書き）
import { useMemo, useRef } from "react"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { controlClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type Decoration, decorate } from "./edit"
import styles from "./RichBody.module.css"
import { textColorRef } from "./rich"
import { textColorsOf } from "./text-colors"

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
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const viewer = useMatomezuState(s => s.settings.textColors)
  const colors = useMemo(() => (book ? textColorsOf(catalog, book, viewer) : null), [catalog, book, viewer])
  const ref = useRef<HTMLTextAreaElement>(null)
  const apply = (d: Decoration) => {
    const el = ref.current
    if (!el) return
    const done = decorate(value, el.selectionStart, el.selectionEnd, d)
    if (done.text.length > maxLength) return
    onChange(done.text)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(done.start, done.end)
    })
  }
  return (
    <div className={styles.joined}>
      <div className={styles.bar} role="toolbar" aria-label={t("Body decoration")}>
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
