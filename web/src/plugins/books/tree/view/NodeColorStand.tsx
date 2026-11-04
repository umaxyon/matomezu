// 節の色のスタンド: 色を選んでいる間（その場の編集 NODE_COLOR_PICK）、選んでいる節のすぐ下に立ち、ブックのテーマの代表色・「なし」（テーマの塗り）・好きな色を出す。
// 代表色と「なし」は押すとすぐ塗って閉じる。好きな色は選んでいる間はビューに持ち、スタンドを閉じるときに塗る。
// 子はアクション node-update、根は base の page-update（ページのフィールドの受け方で根の色だけ）で塗る（useNodeWrite）。塗れなければ（ロックなど）色は押せない形で出す。
// 断られたら、トーストで知らせる。外を押すと閉じ（好きな色を選んでいれば塗る）、Esc は塗らずに閉じる
import { useEffect, useRef, useState } from "react"
import { useActions, useCoreCatalog, useMessages } from "../../../../plugin-api/ui"
import { refusalMessage } from "../../../base"
import { ColorPicker, Stand, type Swatch } from "../../../base/ui"
import { kit } from "../kit"
import styles from "./NodeColorStand.module.css"
import { useNodeWrite } from "./useNodeWrite"

export function NodeColorStand({
  stage,
  page,
  node,
  isRoot,
  color,
  swatches,
}: {
  stage: string
  page: string
  node: string
  isRoot: boolean
  color: string | undefined
  swatches: { palette: readonly Swatch[]; none: string }
}) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const { setEditing, showToast } = useActions()
  const { allowed, write } = useNodeWrite(stage, page, isRoot)
  const [picked, setPicked] = useState<{ color: string | undefined } | null>(null) // 好きな色で選んでいる色（閉じるときに塗る）
  const ref = useRef<HTMLDivElement>(null)
  const pending = useRef(picked)
  pending.current = picked

  const paint = (next: string | undefined) => write(page, node, { color: next ?? null })
  const choose = (next: string | undefined) => {
    const done = paint(next)
    if (!done.ok)
      showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Does not fit on the paper")) })
    setEditing(stage, false)
  }
  // 閉じる（好きな色を選んでいれば、その色で塗る）
  const close = () => {
    const p = pending.current
    if (p && p.color !== color) choose(p.color)
    else setEditing(stage, false)
  }

  // 外を押すと閉じ、Esc は選んでいた好きな色を塗らずに閉じる（好きな色のポップアップの中も、このスタンドの中）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 閉じ方は開いている間ずっと同じ
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return
      close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(stage, false)
    }
    document.addEventListener("pointerdown", down, true)
    window.addEventListener("keydown", key)
    return () => {
      document.removeEventListener("pointerdown", down, true)
      window.removeEventListener("keydown", key)
    }
  }, [])

  return (
    <Stand anchor={node} label={t("Node color")}>
      <div ref={ref} className={styles.panel}>
        {swatches.palette.map(s => (
          <button
            key={s.name}
            type="button"
            className={styles.swatch}
            style={{ background: s.hex }}
            aria-label={s.label}
            aria-pressed={color === s.name}
            disabled={!allowed}
            onClick={() => choose(s.name)}
          />
        ))}
        <button
          type="button"
          className={styles.none}
          style={{ background: swatches.none }}
          aria-label={t("None")}
          aria-pressed={color === undefined}
          disabled={!allowed}
          onClick={() => choose(undefined)}
        />
        <ColorPicker
          label={t("Any color")}
          value={picked ? picked.color : color}
          palette={swatches.palette}
          none={swatches.none}
          disabled={!allowed}
          onChange={next => setPicked({ color: next })}
        />
      </div>
    </Stand>
  )
}
