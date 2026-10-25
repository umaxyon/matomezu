// 線の既定の通り方の設定のコンポーネント（設定の項目 line.route のビュー）。ブックの設定では折れ線か直線を選び（既定を選べば値を消す）、
// ページの設定では「ブックを継承」・折れ線・直線から選ぶ（継承の名前の後ろに、今のブックの既定を添える）
import { type SettingControlProps, useT } from "../../../plugin-api/ui"
import { Choices, controlClass, Field, rowClass } from "../../base/ui"
import { ROUTE_ICONS } from "./icons"
import type { LineRoute } from "./line"

const ROUTE_NAMES = { elbow: "Elbow", straight: "Straight" } as const

export function RouteSetting({ of, label, value, inherited, onChange }: SettingControlProps<LineRoute>) {
  const t = useT()
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
    <Field label={label}>
      {id => (
        <select
          id={id}
          className={controlClass}
          value={value ?? ""}
          onChange={e => onChange((e.target.value || undefined) as LineRoute | undefined)}
        >
          <option value="">{t("Inherit from book ({route})", { route: t(ROUTE_NAMES[inherited]) })}</option>
          <option value="elbow">{t("Elbow")}</option>
          <option value="straight">{t("Straight")}</option>
        </select>
      )}
    </Field>
  )
}
