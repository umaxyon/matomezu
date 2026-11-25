// 文字の色の設定のコンポーネント（利用者の設定の項目 text-colors のビュー）: 文字の色ごとの、色を選ぶポップアップの丸と名前を横に並べる（入らなければ次の行へ）。
// 丸は効いている色（上書きが無ければ定義の色で、「なし」を選ぶと定義の色に戻る）。名前を押しても丸を押したのと同じ
import { useId } from "react"
import { settingOr } from "../../../core/def/setting"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { ColorPicker, NO_COLOR } from "../dialog-host/ColorPicker"
import { inlineClass, pairClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type TextColorValues, withTextColor } from "./text-colors"

export function TextColorsSetting({ label, help, value, onChange, onReset }: UserSettingControlProps<TextColorValues>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const own = settingOr(value, undefined)
  const id = useId()
  return (
    <Section title={label} help={help}>
      <div className={inlineClass}>
        {[...catalog.textColors.values()].map(c => (
          <span key={c.id} className={pairClass}>
            <ColorPicker
              id={`${id}${c.id}`}
              label={t(c.title)}
              value={own?.[c.id] ?? NO_COLOR}
              palette={[]}
              none={c.color}
              onChange={hex => {
                const next = withTextColor(own, c.id, hex === NO_COLOR ? undefined : hex)
                if (next === undefined) onReset()
                else onChange(next)
              }}
            />
            <label htmlFor={`${id}${c.id}`}>{t(c.title)}</label>
          </span>
        ))}
      </div>
    </Section>
  )
}
