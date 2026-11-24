// ほかのホストの行の中身: ペアリングしたホストのレコードに、常駐だけが持つ様子（つながっているか・今の名前など）をホスト id で重ねる
import type { PairedHost } from "./pairing"

// 常駐だけが持つ様子（base の PeerLive）の、行に使う所。形は呼ぶ側が決め、名乗っていない名前の値（base の NOT_TOLD）も呼ぶ側が渡す
interface LiveName<N> {
  hostId: string
  label: string
  name: string | N
  userName: string | N
}

export interface HostRow<L> {
  record: PairedHost
  live: L | undefined
  name: string // 今のホスト名（つながったときに聞いた物。無ければペアリングしたときの名前）
  userName: string
  // 出す名前: 常駐が決めた呼び名（同じ名前のホストがあれば鍵の印の頭 4 字を添えた物。届く行と AI の send_message の host と同じ）。
  // 常駐の様子がまだ届いていなければ、ペアリングしたときの名前
  label: string
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
    return { record, live: l, name, userName, label: l?.label || record.nameAtPairing }
  })

// 番地:ポートの番地だけ（IPv6 の角括弧も外す）
export const ipOf = (addr: string): string => addr.slice(0, addr.lastIndexOf(":")).replace(/^\[|\]$/g, "")
