// 利用者名の項目のビュー: 空なら「あなた」を薄く出す
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { kit } from "../kit"
import { TextSettingControl } from "./UserSettings"

export function UserNameSetting(props: UserSettingControlProps<string>) {
  const t = useMessages(kit)
  return <TextSettingControl {...props} placeholder={t("You")} />
}
