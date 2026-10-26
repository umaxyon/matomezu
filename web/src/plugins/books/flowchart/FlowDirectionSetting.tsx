// 流れの向きの設定のコンポーネント（設定の項目 flow-direction のビュー）。下へか右へを選ぶ（既定を選べば値を消す）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { Choices, rowClass } from "../../base/ui"
import type { FlowDirection } from "./flowchart"
import { DIRECTION_ICONS } from "./icons"
import { kit } from "./kit"

export function FlowDirectionSetting({ label, value, inherited: given, onChange }: SettingControlProps<FlowDirection>) {
  const t = useMessages(kit)
  const inherited = given ?? "down"
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
}
