// 節の形の設定のコンポーネント（設定の項目 node-shape のビュー）: ブックの設定では箱・下線から選び（既定を選べば値を消す）、
// ページの設定では、左端の「ブック継承」と箱・下線のボタンから選ぶ（継承のボタンの名前に、今のブックの形を添える）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { Choices, InheritChoices, rowClass } from "../../base/ui"
import { SHAPE_ICONS } from "./icons"
import { kit } from "./kit"
import { DEFAULT_NODE_SHAPE, NODE_SHAPES, type NodeShape } from "./shape"

const SHAPE_NAMES = { box: "Box", underline: "Underline" } as const

export function NodeShapeSetting({ of, label, value, inherited: given, onChange }: SettingControlProps<NodeShape>) {
  const t = useMessages(kit)
  const options = NODE_SHAPES.map(s => ({ value: s, label: t(SHAPE_NAMES[s]), icon: SHAPE_ICONS[s] }))
  const inherited = given ?? DEFAULT_NODE_SHAPE
  return (
    <div className={rowClass}>
      <span>{label}</span>
      {of === "book" ? (
        <Choices
          label={label}
          value={value ?? inherited}
          options={options}
          onChange={v => onChange(v === inherited ? undefined : v)}
        />
      ) : (
        <InheritChoices
          label={label}
          inherit={{
            label: t("Inherit from book"),
            title: t("Inherit from book ({shape})", { shape: t(SHAPE_NAMES[inherited]) }),
          }}
          value={value}
          options={options}
          onChange={onChange}
        />
      )}
    </div>
  )
}
