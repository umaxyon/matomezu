// ツールボックスのビュー（ウィジェット toolbox）: ステージのブックのツールボックス（core/toolbox.ts）を横に並べる。出すツールが無ければ何も描かない。
// 押すとそのアイテムを置こうとし（もう一度押すと取り消す）、置こうとしているものは押されている見た目にする

import { toolboxOf } from "../../../core/toolbox"
import { useT } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import styles from "./ToolboxView.module.css"

export function ToolboxView({ stage }: { stage: string }) {
  const book = useMatomezuState(s => {
    const o = s.workspace.stages.find(st => st.id === stage)?.opened
    return o ? s.books[o.book] : undefined
  })
  const placing = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.placing ?? null)
  const { togglePlacing } = useActions()
  const t = useT()
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const tools = book ? toolboxOf(catalog, book) : []
  if (tools.length === 0) return null
  return (
    <div className={styles.toolbox} role="toolbar" aria-label={t("Tools")}>
      {tools.map(id => {
        const def = catalog.items.get(id)
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
