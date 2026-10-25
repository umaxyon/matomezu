// 画面を開いた所に合うホストを選んで読む: 常駐から開いていればサーバーのホスト、そうでなければ fallback（サーバーなし）
import type { Host, Loaded } from "./host"
import { NoServer, serverHost } from "./server"

export async function startHost(fallback: () => Host): Promise<{ host: Host; loaded: Loaded }> {
  const server = serverHost()
  try {
    return { host: server, loaded: await server.load() }
  } catch (e) {
    if (!(e instanceof NoServer)) throw e
  }
  const host = fallback()
  return { host, loaded: await host.load() }
}
