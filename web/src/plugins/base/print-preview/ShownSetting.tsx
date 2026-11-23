// 紙に入れるかの設定の項目のコンポーネント（印刷区画の番号・ブック名・ページ名のビュー）: 名前と入り切りのスイッチの 1 行。既定（入れない）にすれば値を消す
import { settingOr } from "../../../core/def/setting"
import type { SettingControlProps } from "../../../ui/plugin"
import { rowClass, Switch } from "../dialog-host/FormParts"

export function ShownSetting({ label, value, inherited, onChange, onReset }: SettingControlProps<"shown" | "hidden">) {
  const now = settingOr(value, inherited)
  return (
    <div className={rowClass}>
      <span>{label}</span>
      <Switch label={label} checked={now === "shown"} onChange={on => (on ? onChange("shown") : onReset())} />
    </div>
  )
}
