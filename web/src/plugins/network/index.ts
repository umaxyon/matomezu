// ネットワークのプラグイン: マシンごとの matomezu のホストどうしをつなぐ。利用者の設定の項目（ほかのホストとつなぐか・ホスト名）を持ち、
// 常駐がその設定でホストどうしの入口を開け閉めする（internal/server/hosts.go）
import { defineBuiltin } from "../../plugin-api/builtin"
import { PAIRING_DIALOG, PAIRING_REQUEST_DIALOG, PORT_REPICK_DIALOG, UNPAIR_DIALOG } from "./dialogs"
import { kit } from "./kit"
import {
  PAIRED_HOST,
  PAIRED_HOST_ADD,
  PAIRED_HOST_REMOVE,
  PAIRING_ACCEPT,
  PAIRING_DECLINE,
  PAIRING_REQUEST,
  PAIRING_REQUEST_ADD,
} from "./pairing"
import { CONNECT_HOSTS, HOST_NAME } from "./settings"

export { PAIRING_DIALOG, PAIRING_REQUEST_DIALOG, PORT_REPICK_DIALOG, UNPAIR_DIALOG } from "./dialogs"
export { PAIRED_HOST, PAIRING_REQUEST, type PairedHost, type PairingRequest } from "./pairing"
export { CONNECT_HOSTS, HOST_NAME } from "./settings"

export const NETWORK_PLUGIN = defineBuiltin(
  kit.plugin({
    userSettings: [HOST_NAME, CONNECT_HOSTS],
    subjects: [PAIRED_HOST, PAIRING_REQUEST],
    actions: [PAIRING_REQUEST_ADD, PAIRING_ACCEPT, PAIRING_DECLINE, PAIRED_HOST_ADD, PAIRED_HOST_REMOVE],
    dialogs: [PORT_REPICK_DIALOG, PAIRING_DIALOG, PAIRING_REQUEST_DIALOG, UNPAIR_DIALOG],
  }),
)

declare module "../../core/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface SubjectTable {
    "@matomezu/network:paired-host": typeof PAIRED_HOST
    "@matomezu/network:pairing-request": typeof PAIRING_REQUEST
  }
  interface ActionTable {
    "@matomezu/network:pairing-request-add": typeof PAIRING_REQUEST_ADD
    "@matomezu/network:pairing-accept": typeof PAIRING_ACCEPT
    "@matomezu/network:pairing-decline": typeof PAIRING_DECLINE
    "@matomezu/network:paired-host-add": typeof PAIRED_HOST_ADD
    "@matomezu/network:paired-host-remove": typeof PAIRED_HOST_REMOVE
  }
  interface DialogTable {
    "@matomezu/network:port-repick": typeof PORT_REPICK_DIALOG
    "@matomezu/network:pairing": typeof PAIRING_DIALOG
    "@matomezu/network:pairing-request": typeof PAIRING_REQUEST_DIALOG
    "@matomezu/network:unpair": typeof UNPAIR_DIALOG
  }
  interface UserSettingTable {
    "@matomezu/network:connect-hosts": typeof CONNECT_HOSTS
    "@matomezu/network:host-name": typeof HOST_NAME
  }
}
