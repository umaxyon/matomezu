// ホストとのつながりの見張り: つながりの番号とつながっているか、長く切れたままなら切れていると見せる待ちと、
// 知らせが届かなければ黙って切れたとみてつなぎ直す待ち。

import type { MatomezuInstance } from "../store/state"
import type { Events, Net } from "./server"

export const OFFLINE_MS = 10_000 // つながりがこれより長く切れたままなら、切れていると見せる
export const QUIET_MS = 60_000 // 知らせ（keep も）がこれより長く届かなければ、つながりが黙って切れたとみてつなぎ直す（常駐は 25 秒ごとに keep を送る）

export interface LinkWatchDeps {
  net: Net
  events: () => Events | null // 今の知らせのつながり
  attachAgain: () => void // 新しく知らせにつなぐ（つながると hello が来る）
  instance: () => MatomezuInstance | null
  logLine: (text: string) => void
}

export function createLinkWatch({ net, events, attachAgain, instance, logLine }: LinkWatchDeps) {
  let link = 0 // 今のつながりの番号（hello のたびに増やす）
  let online = false // 知らせにつながっているか
  let offlineTimer: (() => void) | null = null // 切れていると見せるまでの待ち
  let quietTimer: (() => void) | null = null // 黙って切れたとみるまでの待ち（取り消す関数。見張っていなければ null）
  let heardAt = 0 // 最後に知らせが届いた（つなぎ直し始めた）壁時計の時刻
  // つながりが切れた。長く切れたままなら、切れていると見せる
  const lost = (why: string) => {
    const was = online
    online = false
    if (was) logLine(why)
    offlineTimer ??= net.later(() => instance()?.setOffline(true), OFFLINE_MS)
  }
  // 黙って切れたとみて、閉じてつなぎ直す（つながると hello が来る）
  const reconnect = (source: Events, why: string) => {
    if (events() !== source) return
    quietTimer?.()
    quietTimer = null
    lost(why)
    source.close()
    attachAgain()
  }
  // 知らせが届くたびに待ち直す。QUIET_MS 何も届かなければ、つなぎ直す
  const heard = (source: Events) => {
    heardAt = net.now()
    quietTimer?.()
    quietTimer = net.later(() => reconnect(source, `no event for ${QUIET_MS / 1000}s; connecting again`), QUIET_MS)
  }
  // 見張っている間に、壁時計で QUIET_MS 何も届いていなければ、待ちを待たずにつなぎ直す（スリープ明けにフォーカスされたとき）
  const checkQuiet = () => {
    const source = events()
    if (quietTimer && source && net.now() - heardAt >= QUIET_MS)
      reconnect(source, `no event for ${Math.round((net.now() - heardAt) / 1000)}s by the clock; connecting again`)
  }
  return {
    link: () => link,
    online: () => online,
    // hello が来た: 新しいつながりの番号を振り、つながっていることにする
    opened: () => {
      link += 1
      online = true
    },
    // つなぎ直した: 切れていると見せる待ちを止め、つながっていると見せる
    recovered: () => {
      offlineTimer?.()
      offlineTimer = null
      instance()?.setOffline(false)
    },
    lost,
    heard,
    checkQuiet,
    // 見張りを止める
    stop: () => {
      quietTimer?.()
      quietTimer = null
      offlineTimer?.()
      offlineTimer = null
    },
  }
}
