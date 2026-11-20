// 常駐に頼むホストクライアントを作って読む。常駐が答えない（止まっている・まだ立っていない）なら、つながるまで WAIT_MS ごとに読み直す。ホストを起動はしない。
// 常駐が立っていてこのブラウザを知らない（画面 cookie が無い・合わない。E402）なら、読まずに unknown-browser を返す（何を描くかは画面の入口が決める）

import type { MatomezuError } from "../core/errors"
import type { HostClient, Loaded } from "./client"
import { NoServer, serverClient } from "./server"

const WAIT_MS = 1000

export type Opened = { state: "opened"; client: HostClient; loaded: Loaded } | { state: "unknown-browser" }

// connect は常駐に頼むホストクライアントを作る（テストでは差し替える）
export async function openClient(connect: () => HostClient = serverClient): Promise<Opened> {
  for (;;) {
    const server = connect()
    try {
      return { state: "opened", client: server, loaded: await server.load() }
    } catch (e) {
      if ((e as Partial<MatomezuError>).code === "E402") return { state: "unknown-browser" }
      if (!(e instanceof NoServer)) throw e
    }
    await new Promise(r => setTimeout(r, WAIT_MS))
  }
}
