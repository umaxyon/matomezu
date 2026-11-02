// 流れの向きの設定のコンポーネント（設定の項目 flow-direction のビュー）: 下へか右へを選ぶ（base の ChoiceSetting）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { ChoiceSetting } from "../../base/ui"
import type { FlowDirection } from "./flowchart"
import { DIRECTION_ICONS } from "./icons"
import { kit } from "./kit"

export function FlowDirectionSetting(props: SettingControlProps<FlowDirection>) {
  const t = useMessages(kit)
  const options = [
    { value: "down" as const, label: t("Down"), icon: DIRECTION_ICONS.down },
    { value: "right" as const, label: t("Right"), icon: DIRECTION_ICONS.right },
  ]
  return <ChoiceSetting {...props} options={options} />
}
