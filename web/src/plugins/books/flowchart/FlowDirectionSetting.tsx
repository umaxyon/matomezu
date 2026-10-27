// 流れの向きの設定のコンポーネント（設定の項目 flow-direction のビュー）。ブックの設定では下へか右へを選び（既定を選べば値を消す）、
// ページの設定では、左端の「ブック継承」と下へ・右へのボタンから選ぶ（継承のボタンの名前に、今のブックの向きを添える）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { Choices, InheritChoices, rowClass } from "../../base/ui"
import type { FlowDirection } from "./flowchart"
import { DIRECTION_ICONS } from "./icons"
import { kit } from "./kit"

const DIRECTION_NAMES = { down: "Down", right: "Right" } as const

export function FlowDirectionSetting({
  of,
  label,
  value,
  inherited: given,
  onChange,
}: SettingControlProps<FlowDirection>) {
  const t = useMessages(kit)
  const inherited = given ?? "down"
  if (of === "book")
    return (
      <div className={rowClass}>
        <span>{label}</span>
        <Choices
          label={label}
          value={value ?? inherited}
          options={[
            { value: "down", label: t("Down"), icon: DIRECTION_ICONS.down },
            { value: "right", label: t("Right"), icon: DIRECTION_ICONS.right },
          ]}
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
          title: t("Inherit from book ({direction})", { direction: t(DIRECTION_NAMES[inherited]) }),
        }}
        value={value}
        options={[
          { value: "down", label: t("Down"), icon: DIRECTION_ICONS.down },
          { value: "right", label: t("Right"), icon: DIRECTION_ICONS.right },
        ]}
        onChange={onChange}
      />
    </div>
  )
}
