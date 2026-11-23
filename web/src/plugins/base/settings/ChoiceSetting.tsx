// 選択肢から選ぶ設定の項目のコンポーネント（項目のビューが options を渡して使う）: 名前と、選択肢のボタンの並びの 1 行。
// 選択肢から選び、既定（値が無いときに使う値）を選べば値を消す
import type { ReactNode } from "react"
import { settingOr } from "../../../core/def/setting"
import type { SettingControlProps } from "../../../ui/plugin"
import { Choices, NO_CHOICE, rowClass } from "../dialog-host/FormParts"

export function ChoiceSetting<V extends string>({
  label,
  value,
  inherited,
  onChange,
  onReset,
  options,
}: Omit<SettingControlProps<V>, "book" | "of"> & {
  options: readonly { value: V; label: string; icon: ReactNode }[]
}) {
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <Choices<V>
        label={label}
        value={settingOr(value, settingOr(inherited, NO_CHOICE))}
        options={options}
        clearable // 既定の無い項目は、値が無ければどれも選んでいない（選んでいる物をもう一度押しても消さない）
        onChange={v => {
          if (v === NO_CHOICE) return
          if (v === inherited) onReset()
          else onChange(v)
        }}
      />
    </div>
  )
}
