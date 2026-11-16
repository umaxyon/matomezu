// 選択肢から選ぶ設定の項目のコンポーネント（項目のビューが options を渡して使う）: 名前と、選択肢のボタンの並びの 1 行。
// 選択肢から選び、既定（値が無いときに使う値）を選べば値を消す
import type { ReactNode } from "react"
import type { SettingControlProps } from "../../../ui/plugin"
import { Choices, rowClass } from "../dialog-host/FormParts"

export function ChoiceSetting<V extends string>({
  label,
  value,
  inherited,
  onChange,
  options,
}: Omit<SettingControlProps<V>, "book" | "of"> & {
  options: readonly { value: V; label: string; icon: ReactNode }[]
}) {
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <Choices<V>
        label={label}
        value={value ?? inherited}
        options={options}
        clearable // 既定の無い項目は、値が無ければどれも選んでいない（選んでいる物をもう一度押しても消さない）
        onChange={v => {
          if (v !== undefined) onChange(v === inherited ? undefined : v)
        }}
      />
    </div>
  )
}
