// 節の形の設定のコンポーネント（設定の項目 node-shape のビュー）: 箱・下線から選ぶ（base の ChoiceSetting）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { ChoiceSetting } from "../../base/ui"
import { SHAPE_ICONS } from "./icons"
import { kit } from "./kit"
import { NODE_SHAPES, type NodeShape } from "./shape"

const SHAPE_NAMES = { box: "Box", underline: "Underline" } as const

export function NodeShapeSetting(props: SettingControlProps<NodeShape>) {
  const t = useMessages(kit)
  const options = NODE_SHAPES.map(s => ({ value: s, label: t(SHAPE_NAMES[s]), icon: SHAPE_ICONS[s] }))
  return <ChoiceSetting {...props} options={options} />
}
