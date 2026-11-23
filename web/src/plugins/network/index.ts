// ネットワークのプラグイン: マシンごとの matomezu のホストどうしをつなぐ。利用者の設定の項目（ほかのホストとつなぐか・ホスト名）を持ち、
// 常駐がその設定でホストどうしの入口を開け閉めする（internal/server/hosts.go）
import { defineBuiltin } from "../../plugin-api/builtin"
import { kit } from "./kit"
import { CONNECT_HOSTS, HOST_NAME } from "./settings"

export { CONNECT_HOSTS, HOST_NAME } from "./settings"

export const NETWORK_PLUGIN = defineBuiltin(kit.plugin({ userSettings: [HOST_NAME, CONNECT_HOSTS] }))

declare module "../../core/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface UserSettingTable {
    "@matomezu/network:connect-hosts": typeof CONNECT_HOSTS
    "@matomezu/network:host-name": typeof HOST_NAME
  }
}
