// 文字の色の設定のコンポーネント（設定の項目 book-text-colors のビュー）: 文字の色ごとに、色を選ぶポップアップ（「なし」は定義の色）
import { useMessages } from "../../../ui/i18n"
import type { SettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { ColorPicker } from "../dialog-host/ColorPicker"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import type { TextColorValues } from "./text-colors"

export function TextColorsSetting({ label, value, onChange }: SettingControlProps<TextColorValues>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const set = (id: string, hex: string | undefined) => {
    const next: Record<string, string> = { ...value }
    if (hex === undefined) delete next[id]
    else next[id] = hex
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }
  return (
    <Section title={label}>
      {[...catalog.textColors.values()].map(c => (
        <div key={c.id} className={rowClass}>
          <span>{t(c.title)}</span>
          <ColorPicker
            label={t(c.title)}
            value={value?.[c.id]}
            palette={[]}
            none={c.color}
            onChange={hex => set(c.id, hex)}
          />
        </div>
      ))}
    </Section>
  )
}
