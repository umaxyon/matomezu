// 線の既定の通り方の設定のコンポーネント（設定の項目 line-route のビュー）: 折れ線か直線を選ぶ（base の ChoiceSetting）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { ChoiceSetting } from "../../base/ui"
import { ROUTE_ICONS } from "./icons"
import { kit } from "./kit"
import type { LineRoute } from "./line"

export function RouteSetting(props: SettingControlProps<LineRoute>) {
  const t = useMessages(kit)
  const options = [
    { value: "elbow" as const, label: t("Elbow"), icon: ROUTE_ICONS.elbow },
    { value: "straight" as const, label: t("Straight"), icon: ROUTE_ICONS.straight },
  ]
  return <ChoiceSetting {...props} options={options} />
}
