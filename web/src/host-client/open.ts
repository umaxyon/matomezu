// 常駐に頼むホストクライアントを作って読む。常駐が答えない（止まっている・まだ立っていない）なら、つながるまで WAIT_MS ごとに読み直す。ホストを起動はしない

import type { MatomezuError } from "../core/errors"
import type { HostClient, Loaded } from "./client"
import { NoServer, serverClient } from "./server"

const WAIT_MS = 1000

export async function openClient(): Promise<{ client: HostClient; loaded: Loaded }> {
  for (;;) {
    const server = serverClient()
    try {
      return { client: server, loaded: await server.load() }
    } catch (e) {
      if (!(e instanceof NoServer)) {
        if ((e as Partial<MatomezuError>).code === "E402") showOpenHint()
        throw e
      }
    }
    await new Promise(r => setTimeout(r, WAIT_MS))
  }
}

// ペアを組んでいないブラウザには、画面を作る前の素の 1 行を出す（読み込む言葉の表がまだ無いので、ここだけ 2 言語を直に持つ）
function showOpenHint() {
  const ja = navigator.languages.some(l => l.startsWith("ja"))
  document.body.textContent = ja ? "ターミナルで matomezu open を実行してください" : "Run matomezu open in a terminal"
}
