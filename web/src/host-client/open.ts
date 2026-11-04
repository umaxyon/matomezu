// 常駐に頼むホストクライアントを作って読む。常駐が答えない（止まっている・まだ立っていない）なら、つながるまで WAIT_MS ごとに読み直す。ホストを起動はしない
import type { HostClient, Loaded } from "./client"
import { NoServer, serverClient } from "./server"

const WAIT_MS = 1000

export async function openClient(): Promise<{ client: HostClient; loaded: Loaded }> {
  for (;;) {
    const server = serverClient()
    try {
      return { client: server, loaded: await server.load() }
    } catch (e) {
      if (!(e instanceof NoServer)) throw e
    }
    await new Promise(r => setTimeout(r, WAIT_MS))
  }
}
