// ほかのホストの行の中身: ペアリングしたホストのレコードに、常駐だけが持つ様子（つながっているか・今の名前など）をホスト id で重ねる
import type { PairedHost } from "./pairing"

// 常駐だけが持つ様子（base の PeerLive）の、行に使う所。形は呼ぶ側が決め、名乗っていない名前の値（base の NOT_TOLD）も呼ぶ側が渡す
interface LiveName<N> {
  hostId: string
  name: string | N
  userName: string | N
}

export interface HostRow<L> {
  record: PairedHost
  live: L | undefined
  name: string // 今のホスト名（つながったときに聞いた物。無ければペアリングしたときの名前）
  userName: string
}

export const hostRows = <N, L extends LiveName<N>>(
  records: readonly PairedHost[],
  live: readonly L[],
  notTold: N,
): HostRow<L>[] =>
  records.map(record => {
    const l = live.find(x => x.hostId === record.hostId)
    const name = l === undefined || l.name === notTold ? record.nameAtPairing : (l.name as string)
    const userName = l === undefined || l.userName === notTold ? record.userNameAtPairing : (l.userName as string)
    return { record, live: l, name, userName }
  })

// 同じ名前のホストが 2 つ以上あれば、鍵の印の頭 4 字を添える（例 win-lan · 7F3A）
export const shownName = <L>(row: HostRow<L>, rows: readonly HostRow<L>[]): string =>
  rows.filter(r => r.name === row.name).length > 1
    ? `${row.name} · ${row.record.hostId.slice(0, 4).toUpperCase()}`
    : row.name

// 番地:ポートの番地だけ（IPv6 の角括弧も外す）
export const ipOf = (addr: string): string => addr.slice(0, addr.lastIndexOf(":")).replace(/^\[|\]$/g, "")
