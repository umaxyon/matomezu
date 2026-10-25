// 画面を開いた所に合うホストクライアントを選んで読む: ホストから開いていればホストに頼むもの、そうでなければ fallback（サーバーなし）。ホストを起動はしない
import type { HostClient, Loaded } from "./client"
import { NoServer, serverClient } from "./server"

export async function openClient(fallback: () => HostClient): Promise<{ client: HostClient; loaded: Loaded }> {
  const server = serverClient()
  try {
    return { client: server, loaded: await server.load() }
  } catch (e) {
    if (!(e instanceof NoServer)) throw e
  }
  const client = fallback()
  return { client, loaded: await client.load() }
}
