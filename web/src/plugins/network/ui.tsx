// ネットワークのプラグインの見た目: 設定カテゴリ「ネットワーク」と、ホスト名の項目のビュー、コントロールセンターの「ほかのホスト」の節と詳しい所、
// ペアリングのダイアログ（頼む側・届いた頼み）、届いた頼みのしおりと見張り、別のポートにする確かめ、頼みとして受ける確かめ
import { definePluginUi, defineWidget } from "../../plugin-api/ui"
import { defineBookmarks, defineSettingsCategory } from "../base/ui"
import { NETWORK_PLUGIN } from "."
import { AsUserDialog } from "./AsUserDialog"
import { BELOW_PARTICIPANTS, PICKED_DETAIL } from "./control-center-ids"
import { AS_USER_DIALOG, PAIRING_DIALOG, PAIRING_REQUEST_DIALOG, PORT_REPICK_DIALOG, UNPAIR_DIALOG } from "./dialogs"
import { kit } from "./kit"
import { HostNameSetting, NetworkCategory } from "./NetworkCategory"
import { OtherHosts } from "./OtherHosts"
import { PairedHostDetail } from "./PairedHostDetail"
import { PairingDialog } from "./PairingDialog"
import { PairingRequestBookmarks, PairingRequestDialog, PairingRequestWatch } from "./PairingRequest"
import { PortRepickDialog } from "./PortRepickDialog"
import { PAIRED_HOST } from "./pairing"
import { CONNECT_HOSTS, HOST_NAME } from "./settings"
import { UnpairDialog } from "./UnpairDialog"

export const NETWORK_CATEGORY = defineSettingsCategory({
  id: kit.name("settings"),
  title: kit.message("Network"),
  settings: [HOST_NAME.id, CONNECT_HOSTS.id],
  view: NetworkCategory,
})

export const OTHER_HOSTS = defineWidget({ id: kit.name("other-hosts"), slots: [BELOW_PARTICIPANTS], view: OtherHosts })

export const PAIRED_HOST_DETAIL = defineWidget({
  id: kit.name("paired-host-detail"),
  slots: [PICKED_DETAIL],
  forKind: PAIRED_HOST.id,
  view: PairedHostDetail,
})

export const PAIRING_REQUEST_BOOKMARKS = defineBookmarks({
  id: kit.name("pairing-request-bookmarks"),
  view: PairingRequestBookmarks,
})

export const PAIRING_REQUEST_WATCH = defineWidget({
  id: kit.name("pairing-request-watch"),
  slots: ["root"],
  view: PairingRequestWatch,
})

export const NETWORK_UI = definePluginUi(NETWORK_PLUGIN, {
  userSettingViews: { [HOST_NAME.id]: { control: HostNameSetting } },
  widgets: [NETWORK_CATEGORY, OTHER_HOSTS, PAIRED_HOST_DETAIL, PAIRING_REQUEST_BOOKMARKS, PAIRING_REQUEST_WATCH],
  dialogViews: {
    [PORT_REPICK_DIALOG.id]: PortRepickDialog,
    [PAIRING_DIALOG.id]: PairingDialog,
    [PAIRING_REQUEST_DIALOG.id]: PairingRequestDialog,
    [UNPAIR_DIALOG.id]: UnpairDialog,
    [AS_USER_DIALOG.id]: AsUserDialog,
  },
})

declare module "../../core/catalog" {
  interface WidgetTable {
    "@matomezu/network:settings": typeof NETWORK_CATEGORY
    "@matomezu/network:other-hosts": typeof OTHER_HOSTS
    "@matomezu/network:paired-host-detail": typeof PAIRED_HOST_DETAIL
    "@matomezu/network:pairing-request-bookmarks": typeof PAIRING_REQUEST_BOOKMARKS
    "@matomezu/network:pairing-request-watch": typeof PAIRING_REQUEST_WATCH
  }
}
