// プロジェクト設定の「チケットタグ」: 左にタグの一覧（行ごとに色・名前・有効）、右に選んだタグの「タグプロンプト」。
// 色は外観枠の代表色の 6 つの役割から見本だけで選ぶ（「なし」は無い。見本の色はスキンの代表色の CSS 変数で、バッヂと同じ色）。
// 「タグ追加」で空の行を足して名前の入力Formに入る。名前の入力Formを離れたとき、空か、ほかのタグと重なっていれば片付ける（settings-rows）
import { useState } from "react"
import { PALETTE } from "../../../plugin-api"
import { useMessages } from "../../../plugin-api/ui"
import { ColorPicker, type Swatch } from "../../base/ui"
import { kit } from "../kit"
import { TAG_NAME_MAX } from "../project"
import { NameField, PromptSplit, rowProps } from "./PromptSplit"
import type { TagRow } from "./rows"
import type { EditableRows } from "./useEditableRows"

export function TagSettings({ tags, repeated }: { tags: EditableRows<TagRow>; repeated: ReadonlySet<string> }) {
  const t = useMessages(kit)
  const { rows, change, add, leave, nameRef } = tags
  const [selected, setSelected] = useState<string | null>(null)
  const chosen = rows.find(r => r.key === selected)
  const swatches: readonly Swatch[] = PALETTE.map((role, i) => ({
    name: role,
    hex: `var(--skin-palette-${role})`,
    label: t("Color {n}", { n: i + 1 }),
  }))
  return (
    <PromptSplit
      notes={repeated.size > 0 ? [t("The names repeat")] : []}
      addLabel={t("Add a tag")}
      onAdd={() => setSelected(add({ color: "muted", enabled: true, prompt: "" }))}
      promptTitle={t("Tag prompt")}
      prompt={chosen?.prompt}
      onPromptChange={prompt => chosen && change(chosen.key, { prompt })}
    >
      {rows.map(tag => (
        <div key={tag.key} {...rowProps(tag.key, selected, setSelected)}>
          <ColorPicker
            label={t("Color of {name}", { name: tag.name })}
            value={tag.color}
            palette={swatches}
            swatchesOnly
            onChange={color => {
              const role = PALETTE.find(p => p === color)
              if (role) change(tag.key, { color: role })
            }}
          />
          <NameField
            label={t("Tag name")}
            editLabel={t("Edit the name")}
            value={tag.name}
            max={TAG_NAME_MAX}
            repeated={repeated.has(tag.key)}
            inputRef={nameRef(tag.key)}
            onFocus={() => setSelected(tag.key)}
            onChange={name => change(tag.key, { name })}
            onLeave={() => leave(tag.key)}
          />
          <input
            type="checkbox"
            aria-label={t("Use {name}", { name: tag.name })}
            checked={tag.enabled}
            onChange={e => change(tag.key, { enabled: e.target.checked })}
          />
        </div>
      ))}
    </PromptSplit>
  )
}
