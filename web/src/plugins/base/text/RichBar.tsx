// 装飾のボックス: 太字のボタンと、文字の色の丸・色なし。押すと、入力Form target（RichInput）の選んだ範囲に装飾を付ける（もう付いていれば外す。
// 範囲が無ければ、次に書く字に付ける。edit.ts）。押しても入力Form から焦点を外さない（その場の編集は焦点が外れると終わるため）。
// 色の丸は効いている色（ステージが開いているブックの上書きと、見る人の上書き）
import type { CSSProperties, RefObject } from "react"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import type { Decoration } from "./edit"
import styles from "./RichBar.module.css"
import type { RichInputHandle } from "./RichInput"
import { useTextColors } from "./use-text-colors"

export function RichBar({
  stage,
  target,
  className,
  style,
}: {
  stage: string // 色を決めるブックを開いているステージ
  target: RefObject<RichInputHandle | null>
  className?: string
  style?: CSSProperties
}) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const colors = useTextColors(stage)
  const apply = (d: Decoration) => target.current?.decorate(d)
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
          onClick={() => apply({ color: c.id })}
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
