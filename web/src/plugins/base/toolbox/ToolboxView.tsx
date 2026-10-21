// ツールボックスのビュー（ウィジェット toolbox）: ステージのブックのツールボックス（core/toolbox.ts）を横に並べる。出すツールが無ければ何も描かない。
// 押すとそのアイテムを置こうとし（もう一度押すと取り消す）、置こうとしているものは押されている見た目にする

import { toolboxOf } from "../../../core/toolbox"
import { useT } from "../../../ui/i18n"
import { useActions, useApp, useRegistry, useUi } from "../../../ui/store-context"
import styles from "./ToolboxView.module.css"

export function ToolboxView({ stage }: { stage: string }) {
  const book = useApp(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const placing = useApp(s => s.workspace.stages.find(st => st.id === stage)?.placing ?? null)
  const { togglePlacing } = useActions()
  const t = useT()
  const registry = useRegistry()
  const ui = useUi()
  const tools = book ? toolboxOf(registry, book) : []
  if (tools.length === 0) return null
  return (
    <div className={styles.toolbox} role="toolbar" aria-label={t("Tools")}>
      {tools.map(id => {
        const def = registry.items.get(id)
        return (
          <button
            key={id}
            type="button"
            className={styles.tool}
            aria-label={def ? t(def.title) : id}
            aria-pressed={placing === id}
            onClick={() => togglePlacing(stage, id)}
          >
            {ui.items.get(id)?.icon}
          </button>
        )
      })}
    </div>
  )
}
