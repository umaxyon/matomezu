// ネットワークの利用者の設定の項目: ほかのホストとつなぐか（入なら常駐がホストどうしの入口を開く）とホスト名（無ければ OS のホスト名）。
// どちらも常駐が role で引き、利用者だけが変える（よそからの文に操られた AI が変えないよう）
import { z } from "zod"
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
