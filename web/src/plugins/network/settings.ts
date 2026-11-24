// ネットワークの利用者の設定の項目: ほかのホストとつなぐか（入なら常駐がホストどうしの入口を開く）とホスト名（無ければ OS のホスト名）と、
// AI 用ホストリストに載せるこのホストのワークルーム（全部か、様子が最近変わった物だけか）。
// どれも常駐が role で引き、利用者だけが変える（よそからの文に操られた AI が変えないよう）
import { z } from "zod"
import { LISTED_WORKROOMS } from "../../plugin-api"
import { kit } from "./kit"

export const CONNECT_HOSTS = kit.defineSetting({
  id: "connect-hosts",
  title: "Connect with other hosts",
  schema: z.boolean(),
  default: false,
  role: "connect-hosts",
  userOnly: true,
})

export const HOST_NAME = kit.defineSetting({
  id: "host-name",
  title: "Host name",
  schema: z.string().max(40),
  role: "host-name",
  userOnly: true,
})

export const LISTED_WORKROOMS_SETTING = kit.defineSetting({
  id: "listed-workrooms",
  title: "Workrooms of this host on the host list for AIs",
  schema: z.enum(LISTED_WORKROOMS),
  default: "all",
  role: "listed-workrooms",
  userOnly: true,
})
