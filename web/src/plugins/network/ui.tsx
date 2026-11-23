// ネットワークのプラグインの見た目: 設定カテゴリ「ユーザー設定」の節「ネットワーク設定」と、ホスト名の項目のビュー
import { definePluginUi } from "../../plugin-api/ui"
import { defineSettingsSection } from "../base/ui"
import { NETWORK_PLUGIN } from "."
import { kit } from "./kit"
import { HostNameSetting, NetworkSection } from "./NetworkSection"
import { CONNECT_HOSTS, HOST_NAME } from "./settings"

export const NETWORK_SECTION = defineSettingsSection({
  id: kit.name("settings-network"),
  settings: [HOST_NAME.id, CONNECT_HOSTS.id],
  view: NetworkSection,
})

export const NETWORK_UI = definePluginUi(NETWORK_PLUGIN, {
  userSettingViews: { [HOST_NAME.id]: { control: HostNameSetting } },
  widgets: [NETWORK_SECTION],
})

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/network:settings-network": typeof NETWORK_SECTION
  }
}
