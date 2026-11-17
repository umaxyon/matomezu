// 線の形の設定のコンポーネント（設定の項目 line-shape のビュー）: 直線・折れ線・曲線から選ぶ（base の ChoiceSetting）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { ChoiceSetting } from "../../base/ui"
import { LINE_ICONS } from "./icons"
import { kit } from "./kit"
import { LINE_SHAPES, type LineShape } from "./line-shape"

const LINE_NAMES = { straight: "Straight", elbow: "Elbow", curve: "Curve" } as const

export function LineShapeSetting(props: SettingControlProps<LineShape>) {
  const t = useMessages(kit)
  const options = LINE_SHAPES.map(s => ({ value: s, label: t(LINE_NAMES[s]), icon: LINE_ICONS[s] }))
  return <ChoiceSetting {...props} options={options} />
}
