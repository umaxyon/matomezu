// 画面を開いた所に合うホストクライアントを選んで読む: 常駐に頼むもの。常駐が答えないときは、ファイルから開いたか、開いた所が常駐でない
// （http で答えるが API が無い）なら fallback（サーバーなし）を使う。常駐の URL から開いて、そこが何も答えない（常駐が止まっている）なら、
// メモリで始めずに、つながるまで WAIT_MS ごとに読み直す。ホストを起動はしない
import type { HostClient, Loaded } from "./client"
import { NoServer, serverClient } from "./server"

const WAIT_MS = 1000

// 開いた所が答えるか（常駐でなくても、何かが答えれば true）
const answers = () =>
  fetch("api/data").then(
    () => true,
    () => false,
  )

export async function openClient(fallback: () => HostClient): Promise<{ client: HostClient; loaded: Loaded }> {
  const fromServer = window.location.protocol === "http:" || window.location.protocol === "https:"
  for (;;) {
    const server = serverClient()
    try {
      return { client: server, loaded: await server.load() }
    } catch (e) {
      if (!(e instanceof NoServer)) throw e
    }
    if (!fromServer || (await answers())) {
      const client = fallback()
      return { client, loaded: await client.load() }
    }
    await new Promise(r => setTimeout(r, WAIT_MS))
  }
}
