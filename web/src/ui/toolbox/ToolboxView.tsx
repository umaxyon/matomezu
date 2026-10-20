// ツールボックスのビュー: ステージのブックのツールボックス（core/toolbox.ts）を横に並べる。出すツールが無ければ何も描かない

import { toolboxOf } from "../../core/toolbox"
import { useT } from "../i18n"
import { useApp, useRegistry, useUi } from "../store-context"
import styles from "./ToolboxView.module.css"

export function ToolboxView({ stage }: { stage: string }) {
  const book = useApp(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const t = useT()
  const registry = useRegistry()
  const ui = useUi()
  const tools = book ? toolboxOf(registry, book) : []
  if (tools.length === 0) return null
  return (
    <div className={styles.toolbox} role="toolbar" aria-label={t("ツール")}>
      {tools.map(id => {
        const def = registry.items.get(id)
        return (
          <button key={id} type="button" className={styles.tool} aria-label={def ? t(def.title) : id}>
            {ui.items.get(id)?.icon}
          </button>
        )
      })}
    </div>
  )
}
