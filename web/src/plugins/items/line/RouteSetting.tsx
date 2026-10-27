// 線の既定の通り方の設定のコンポーネント（設定の項目 line-route のビュー）。ブックの設定では折れ線か直線を選び（既定を選べば値を消す）、
// ページの設定では、左端の「ブック継承」と折れ線・直線のボタンから選ぶ（継承のボタンの名前に、今のブックの既定を添える）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { Choices, InheritChoices, rowClass } from "../../base/ui"
import { ROUTE_ICONS } from "./icons"
import { kit } from "./kit"
import type { LineRoute } from "./line"

const ROUTE_NAMES = { elbow: "Elbow", straight: "Straight" } as const

export function RouteSetting({ of, label, value, inherited: given, onChange }: SettingControlProps<LineRoute>) {
  const t = useMessages(kit)
  const inherited = given ?? "elbow" // 線の既定の通り方は既定を持つ
  if (of === "book")
    return (
      <div className={rowClass}>
        <span>{label}</span>
        <Choices
          label={label}
          value={value ?? inherited}
          options={[
            { value: "elbow", label: t("Elbow"), icon: ROUTE_ICONS.elbow },
            { value: "straight", label: t("Straight"), icon: ROUTE_ICONS.straight },
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
          title: t("Inherit from book ({route})", { route: t(ROUTE_NAMES[inherited]) }),
        }}
        value={value}
        options={[
          { value: "elbow", label: t("Elbow"), icon: ROUTE_ICONS.elbow },
          { value: "straight", label: t("Straight"), icon: ROUTE_ICONS.straight },
        ]}
        onChange={onChange}
      />
    </div>
  )
}
