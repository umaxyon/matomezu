// スライドを印刷に出すかの設定のコンポーネント（設定の項目 slide-print のビュー）: 3 つから選ぶ（base の ChoiceSetting）
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { ChoiceSetting, ChoiceText } from "../../base/ui"
import { kit } from "./kit"
import type { SlidePrint } from "./print-setting"

export function SlidePrintSetting(props: SettingControlProps<SlidePrint>) {
  const t = useMessages(kit)
  const options = [
    { value: "auto" as const, label: t("Print if filled"), icon: <ChoiceText>{t("Print if filled")}</ChoiceText> },
    { value: "always" as const, label: t("Always print"), icon: <ChoiceText>{t("Always print")}</ChoiceText> },
    { value: "never" as const, label: t("Never print"), icon: <ChoiceText>{t("Never print")}</ChoiceText> },
  ]
  return <ChoiceSetting {...props} options={options} />
}
