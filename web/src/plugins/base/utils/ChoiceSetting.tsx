// 選択肢から選ぶ設定の項目のコンポーネント（項目のビューが options を渡して使う）: 名前と、選択肢のボタンの並びの 1 行。
// ブックの設定では選択肢から選び（既定を選べば値を消す）、ページの設定では、左端の「ブック継承」と選択肢から選ぶ（継承のボタンの名前に、今のブックの値の名前を添える）
import type { ReactNode } from "react"
import { useMessages } from "../../../ui/i18n"
import type { SettingControlProps } from "../../../ui/plugin"
import { Choices, InheritChoices, rowClass } from "../dialog-host/FormParts"
import { kit } from "../kit"

export function ChoiceSetting<V extends string>({
  of,
  label,
  value,
  inherited,
  onChange,
  options,
}: Omit<SettingControlProps<V>, "book"> & {
  options: readonly { value: V; label: string; icon: ReactNode }[]
}) {
  const t = useMessages(kit)
  const inheritedName = options.find(o => o.value === inherited)?.label
  return (
    <div className={rowClass}>
      <span>{label}</span>
      {of === "book" ? (
        <Choices<V>
          label={label}
          value={value ?? inherited}
          options={options}
          clearable // 既定の無い項目は、値が無ければどれも選んでいない（選んでいる物をもう一度押しても消さない）
          onChange={v => {
            if (v !== undefined) onChange(v === inherited ? undefined : v)
          }}
        />
      ) : (
        <InheritChoices
          label={label}
          inherit={{
            label: t("Inherit from book"),
            title: inheritedName ? t("Inherit from book ({value})", { value: inheritedName }) : t("Inherit from book"),
          }}
          value={value}
          options={options}
          onChange={onChange}
        />
      )}
    </div>
  )
}
