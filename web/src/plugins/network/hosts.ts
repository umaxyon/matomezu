// ほかのホストの行の中身: ペアリングしたホストのレコードに、常駐だけが持つ様子（つながっているか・今の名前など）をホスト id で重ねる
import type { PairedHost } from "./pairing"

// 常駐だけが持つ様子のうち、行に使う物（base の Live）
interface Live {
  hostId: string
  connected: boolean
  lastSeen?: string
  addr?: string
  name?: string
  userName?: string
  keyMismatch?: boolean
}

export interface HostRow {
  record: PairedHost
  live: Live | undefined
  name: string // 今のホスト名（つながったときに聞いた物。無ければペアリングしたときの名前）
  userName: string
}

export const hostRows = (records: readonly PairedHost[], live: readonly Live[]): HostRow[] =>
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
