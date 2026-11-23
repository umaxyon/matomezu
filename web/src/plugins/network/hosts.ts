// ほかのホストの行の中身: ペアリングしたホストのレコードに、常駐だけが持つ様子（つながっているか・今の名前など）をホスト id で重ねる
import type { PairedHost } from "./pairing"

// 常駐だけが持つ様子（base の PeerLive）の、行に使う所。形は呼ぶ側が決める
interface LiveName {
  hostId: string
  name?: string
  userName?: string
}

export interface HostRow<L extends LiveName = LiveName> {
  record: PairedHost
  live: L | undefined
  name: string // 今のホスト名（つながったときに聞いた物。無ければペアリングしたときの名前）
  userName: string
}

export const hostRows = <L extends LiveName>(records: readonly PairedHost[], live: readonly L[]): HostRow<L>[] =>
  records.map(record => {
    const l = live.find(x => x.hostId === record.hostId)
    return {
      record,
      live: l,
      name: l?.name || record.nameAtPairing,
      userName: l?.userName || record.userNameAtPairing,
    }
  })

// 同じ名前のホストが 2 つ以上あれば、鍵の印の頭 4 字を添える（例 win-lan · 7F3A）
export const shownName = (row: HostRow, rows: readonly HostRow[]): string =>
  rows.filter(r => r.name === row.name).length > 1
    ? `${row.name} · ${row.record.hostId.slice(0, 4).toUpperCase()}`
    : row.name

// 番地:ポートの番地だけ（IPv6 の角括弧も外す）
export const ipOf = (addr: string): string => addr.slice(0, addr.lastIndexOf(":")).replace(/^\[|\]$/g, "")
