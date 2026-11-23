// ネットワークのプラグインの見た目: 設定カテゴリ「ネットワーク」と、ホスト名の項目のビュー
import { definePluginUi } from "../../plugin-api/ui"
import { defineSettingsCategory } from "../base/ui"
import { NETWORK_PLUGIN } from "."
import { kit } from "./kit"
import { HostNameSetting, NetworkCategory } from "./NetworkCategory"
import { CONNECT_HOSTS, HOST_NAME } from "./settings"

export const NETWORK_CATEGORY = defineSettingsCategory({
  id: kit.name("settings"),
  title: kit.message("Network"),
  settings: [HOST_NAME.id, CONNECT_HOSTS.id],
  view: NetworkCategory,
})

export const NETWORK_UI = definePluginUi(NETWORK_PLUGIN, {
  userSettingViews: { [HOST_NAME.id]: { control: HostNameSetting } },
  widgets: [NETWORK_CATEGORY],
})

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/network:settings": typeof NETWORK_CATEGORY
  }
}
