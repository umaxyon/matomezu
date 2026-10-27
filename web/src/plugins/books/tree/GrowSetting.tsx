// 伸びる向きの設定のコンポーネント（設定の項目 grow のビュー）。ブックの設定では 5 つの向きから選び（既定を選べば値を消す）、
// ページの設定では、左端の「ブック継承」と 5 つの向きのボタンから選ぶ（継承のボタンの名前に、今のブックの向きを添える）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { Choices, InheritChoices, rowClass } from "../../base/ui"
import { GROWS, type Grow } from "./grow"
import { GROW_ICONS } from "./icons"
import { kit } from "./kit"

export const GROW_NAMES = { up: "Up", down: "Down", left: "Left", right: "Right", center: "Center" } as const

export function useGrowOptions() {
  const t = useMessages(kit)
  return GROWS.map(g => ({ value: g, label: t(GROW_NAMES[g]), icon: GROW_ICONS[g] }))
}

export function GrowSetting({ of, label, value, inherited: given, onChange }: SettingControlProps<Grow>) {
  const t = useMessages(kit)
  const options = useGrowOptions()
  const inherited = given ?? "down"
  if (of === "book")
    return (
      <div className={rowClass}>
        <span>{label}</span>
        <Choices
          label={label}
          value={value ?? inherited}
          options={options}
          onChange={v => onChange(v === inherited ? undefined : v)}
        />
      </div>
    )
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <InheritChoices
        label={label}
        inherit={{
          label: t("Inherit from book"),
          title: t("Inherit from book ({direction})", { direction: t(GROW_NAMES[inherited]) }),
        }}
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  )
}
