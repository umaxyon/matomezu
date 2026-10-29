// 説明の見せ方の設定のコンポーネント（設定の項目 notes のビュー）: 説明を出すかのスイッチと、出すときだけその下に開く枠（base の SwitchPanel）に、
// 「・・・」を付けるかと区切り線を引くかのスイッチ。既定の値に戻すと、ページに書いた値を消す
import { type SettingControlProps, useMessages } from "../../../plugin-api/ui"
import { rowClass, Switch, SwitchPanel } from "../../base/ui"
import { kit } from "./kit"
import { NOTE_DEFAULT, type NoteLook } from "./notes"

export function NoteSetting({ label, value, inherited, onChange }: SettingControlProps<NoteLook>) {
  const t = useMessages(kit)
  const fallback = inherited ?? NOTE_DEFAULT
  const look = value ?? fallback
  const change = (patch: Partial<NoteLook>) => {
    const next = { ...look, ...patch }
    const same = next.shown === fallback.shown && next.dots === fallback.dots && next.divider === fallback.divider
    onChange(same ? undefined : next)
  }
  return (
    <SwitchPanel label={label} checked={look.shown} onChange={shown => change({ shown })}>
      <div className={rowClass}>
        <span>{t("Dots before descriptions")}</span>
        <Switch label={t("Dots before descriptions")} checked={look.dots} onChange={dots => change({ dots })} />
      </div>
      <div className={rowClass}>
        <span>{t("Divider before descriptions")}</span>
        <Switch
          label={t("Divider before descriptions")}
          checked={look.divider}
          onChange={divider => change({ divider })}
        />
      </div>
    </SwitchPanel>
  )
}
