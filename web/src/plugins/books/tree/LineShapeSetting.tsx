// 線の形の設定のコンポーネント（設定の項目 line-shape のビュー）: ブックの設定では直線・折れ線・曲線から選び（既定を選べば値を消す）、
// ページの設定では、左端の「ブック継承」と 3 つの形のボタンから選ぶ（継承のボタンの名前に、今のブックの形を添える）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { Choices, InheritChoices, rowClass } from "../../base/ui"
import { LINE_ICONS } from "./icons"
import { kit } from "./kit"
import { DEFAULT_LINE_SHAPE, LINE_SHAPES, type LineShape } from "./line-shape"

const LINE_NAMES = { straight: "Straight", elbow: "Elbow", curve: "Curve" } as const

export function LineShapeSetting({ of, label, value, inherited: given, onChange }: SettingControlProps<LineShape>) {
  const t = useMessages(kit)
  const options = LINE_SHAPES.map(s => ({ value: s, label: t(LINE_NAMES[s]), icon: LINE_ICONS[s] }))
  const inherited = given ?? DEFAULT_LINE_SHAPE
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
            title: t("Inherit from book ({line})", { line: t(LINE_NAMES[inherited]) }),
          }}
          value={value}
          options={options}
          onChange={onChange}
        />
      )}
    </div>
  )
}
